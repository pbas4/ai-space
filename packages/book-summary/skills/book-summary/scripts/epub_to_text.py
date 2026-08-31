#!/usr/bin/env python3
"""Extract readable text from an EPUB using only the Python standard library.

Usage: epub_to_text.py <book.epub> <out.txt>

- Reads the OPF manifest + spine so content comes out in reading order.
- Uses the EPUB's own table of contents (EPUB3 nav document or EPUB2 NCX) to
  insert explicit "## CHAPTER: <title>" markers, so a downstream summarizer can
  segment reliably instead of guessing from headings.
- Extracts the cover image next to <out.txt> as cover.<ext> when present.
- Prepends any Dublin Core metadata it finds (TITLE / AUTHOR / DATE / IDENTIFIER),
  plus a COVER: line when a cover was written.
"""
import html
import os
import posixpath
import re
import sys
import zipfile


def strip_html(markup: str) -> str:
    markup = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", markup)
    markup = re.sub(r"(?i)<br\s*/?>", "\n", markup)
    markup = re.sub(r"(?i)</(p|div|h[1-6]|li|tr|blockquote|section)>", "\n\n", markup)
    markup = re.sub(r"<[^>]+>", "", markup)
    markup = html.unescape(markup)
    markup = re.sub(r"[ \t ]+", " ", markup)
    markup = re.sub(r"\n{3,}", "\n\n", markup)
    return markup.strip()


def first_group(pattern: str, text: str):
    m = re.search(pattern, text, re.S | re.I)
    return strip_html(m.group(1)) if m else None


def join(base: str, href: str) -> str:
    href = href.split("#", 1)[0]
    return posixpath.normpath(posixpath.join(base, href)) if base else posixpath.normpath(href)


def parse_nav_toc(nav_html: str):
    """EPUB3 nav doc -> ordered list of (target_href, fragment, title)."""
    m = re.search(
        r'<nav\b[^>]*epub:type="[^"]*\btoc\b[^"]*"[^>]*>(.*?)</nav>',
        nav_html,
        re.S | re.I,
    )
    block = m.group(1) if m else nav_html
    out = []
    for href, label in re.findall(
        r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', block, re.S | re.I
    ):
        frag = href.split("#", 1)[1] if "#" in href else None
        title = strip_html(label)
        if title:
            out.append((href.split("#", 1)[0], frag, title))
    return out


def parse_ncx_toc(ncx: str):
    """EPUB2 NCX -> ordered list of (target_href, fragment, title)."""
    out = []
    for np in re.findall(r"<navPoint\b.*?</navPoint>", ncx, re.S | re.I):
        label = first_group(r"<text[^>]*>(.*?)</text>", np)
        src = re.search(r'<content\b[^>]*src="([^"]+)"', np, re.I)
        if label and src:
            href = src.group(1)
            frag = href.split("#", 1)[1] if "#" in href else None
            out.append((href.split("#", 1)[0], frag, label))
    return out


def split_by_anchors(doc_html: str, anchors):
    """Split one XHTML doc into (title, text) pieces at the given element ids.

    anchors: ordered list of (fragment_id_or_None, title) for this doc.
    """
    body = re.search(r"<body\b[^>]*>(.*)</body>", doc_html, re.S | re.I)
    content = body.group(1) if body else doc_html

    # Positions of each anchor id in document order.
    cuts = []
    for frag, title in anchors:
        if frag is None:
            cuts.append((0, title))
            continue
        m = re.search(r'id\s*=\s*"%s"' % re.escape(frag), content) or re.search(
            r'name\s*=\s*"%s"' % re.escape(frag), content
        )
        cuts.append((m.start() if m else 0, title))

    # Stable order by position; if everything is at 0 we get a single leading marker.
    cuts.sort(key=lambda t: t[0])
    pieces = []
    for i, (pos, title) in enumerate(cuts):
        end = cuts[i + 1][0] if i + 1 < len(cuts) else len(content)
        text = strip_html(content[pos:end])
        if text:
            pieces.append((title, text))
    if not pieces:
        text = strip_html(content)
        if text:
            pieces.append((None, text))
    return pieces


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    src, out = sys.argv[1], sys.argv[2]
    out_dir = os.path.dirname(os.path.abspath(out))

    with zipfile.ZipFile(src) as z:
        names = z.namelist()

        opf_path = None
        try:
            container = z.read("META-INF/container.xml").decode("utf-8", "replace")
            m = re.search(r'full-path="([^"]+)"', container)
            if m:
                opf_path = m.group(1)
        except KeyError:
            pass
        if not opf_path:
            opf_path = next((n for n in names if n.lower().endswith(".opf")), None)
        if not opf_path:
            print("No OPF found; not a valid EPUB.", file=sys.stderr)
            return 1

        opf = z.read(opf_path).decode("utf-8", "replace")
        base = posixpath.dirname(opf_path)

        # manifest: id -> (href, properties, media-type)
        items = {}
        for tag in re.findall(r"<item\b[^>]*/?>", opf):
            mid = re.search(r'\bid="([^"]+)"', tag)
            href = re.search(r'\bhref="([^"]+)"', tag)
            if not mid or not href:
                continue
            props = re.search(r'\bproperties="([^"]+)"', tag)
            mtype = re.search(r'\bmedia-type="([^"]+)"', tag)
            items[mid.group(1)] = (
                href.group(1),
                props.group(1) if props else "",
                mtype.group(1) if mtype else "",
            )
        href_by_id = {k: v[0] for k, v in items.items()}

        spine = re.findall(r'<itemref\b[^>]*?\bidref="([^"]+)"', opf)
        ordered_hrefs = [href_by_id[s] for s in spine if s in href_by_id] or [
            v[0] for v in items.values()
        ]

        # --- table of contents -------------------------------------------------
        toc = []
        nav_id = next(
            (k for k, v in items.items() if "nav" in v[1].split()), None
        )
        if nav_id:
            try:
                toc = parse_nav_toc(
                    z.read(join(base, href_by_id[nav_id])).decode("utf-8", "replace")
                )
            except KeyError:
                pass
        if not toc:
            ncx_id = next(
                (k for k, v in items.items() if v[2] == "application/x-dtbncx+xml"),
                None,
            )
            spine_toc = re.search(r"<spine\b[^>]*\btoc=\"([^\"]+)\"", opf)
            ncx_id = ncx_id or (spine_toc.group(1) if spine_toc else None)
            if ncx_id and ncx_id in href_by_id:
                try:
                    toc = parse_ncx_toc(
                        z.read(join(base, href_by_id[ncx_id])).decode(
                            "utf-8", "replace"
                        )
                    )
                except KeyError:
                    pass

        # Map resolved content path -> ordered [(fragment, title), ...]
        toc_by_path = {}
        for href, frag, title in toc:
            toc_by_path.setdefault(join(base, href), []).append((frag, title))

        # --- cover image -----------------------------------------------------
        # Prefer a manifest item that really is an image; fall back to the
        # <meta name="cover"> pointer or an id/href containing "cover". If the
        # winner turns out to be an XHTML wrapper (common), follow its first
        # <img src> to the actual picture.
        cover_line = None
        cover_id = next(
            (k for k, v in items.items()
             if "cover-image" in v[1].split() and v[2].startswith("image/")),
            None,
        )
        if not cover_id:
            meta_cover = re.search(r'<meta\b[^>]*name="cover"[^>]*content="([^"]+)"', opf)
            if meta_cover and meta_cover.group(1) in items:
                cover_id = meta_cover.group(1)
        if not cover_id:
            cover_id = next(
                (k for k, v in items.items()
                 if ("cover" in k.lower() or "cover" in v[0].lower())
                 and v[2].startswith("image/")),
                None,
            )
        if not cover_id:
            cover_id = next(
                (k for k in items if k.lower() in ("cover", "coverimage")), None
            )

        def read_cover(chref, depth=0):
            cpath = join(base, chref)
            try:
                data = z.read(cpath)
            except KeyError:
                return None
            ext = os.path.splitext(chref)[1].lower()
            if ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
                name = "cover" + (".jpg" if ext == ".jpeg" else ext)
                with open(os.path.join(out_dir, name), "wb") as cf:
                    cf.write(data)
                return name
            if depth == 0 and re.search(r"\.x?html?$", cpath, re.I):
                img = re.search(r'<img\b[^>]*\bsrc="([^"]+)"',
                                data.decode("utf-8", "replace"), re.I)
                if img:
                    return read_cover(join(posixpath.dirname(chref), img.group(1)), 1)
            return None

        if cover_id:
            cover_line = read_cover(href_by_id[cover_id])

        # --- body text ------------------------------------------------------
        parts, seen = [], set()
        for href in ordered_hrefs:
            path = join(base, href)
            if path in seen or not re.search(r"\.x?html?$", path, re.I):
                continue
            seen.add(path)
            try:
                raw = z.read(path).decode("utf-8", "replace")
            except KeyError:
                continue

            anchors = toc_by_path.get(path)
            if anchors:
                for title, text in split_by_anchors(raw, anchors):
                    if title:
                        parts.append("## CHAPTER: %s\n\n%s" % (title, text))
                    else:
                        parts.append(text)
            else:
                text = strip_html(raw)
                if text:
                    parts.append(text)

        meta = [
            ("TITLE", first_group(r"<dc:title[^>]*>(.*?)</dc:title>", opf)),
            ("AUTHOR", first_group(r"<dc:creator[^>]*>(.*?)</dc:creator>", opf)),
            ("DATE", first_group(r"<dc:date[^>]*>(.*?)</dc:date>", opf)),
            ("IDENTIFIER", first_group(r"<dc:identifier[^>]*>(.*?)</dc:identifier>", opf)),
        ]

    header_lines = [f"{k}: {v}" for k, v in meta if v]
    if cover_line:
        header_lines.append(f"COVER: {cover_line}")
    body = "\n\n".join(parts)
    with open(out, "w", encoding="utf-8") as fh:
        if header_lines:
            fh.write("\n".join(header_lines) + "\n\n" + "=" * 40 + "\n\n")
        fh.write(body + "\n")

    n_marks = body.count("## CHAPTER: ")
    print(
        "epub: %d spine docs, %d TOC chapter markers%s"
        % (len(parts), n_marks, ", cover extracted" if cover_line else "")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
