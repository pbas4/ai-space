#!/usr/bin/env python3
"""Extract readable text from an EPUB using only the Python standard library.

Usage: epub_to_text.py <book.epub> <out.txt>

Reads the OPF manifest + spine so chapters come out in reading order, strips the
XHTML down to text, and prepends any Dublin Core metadata it finds.
"""
import html
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


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    src, out = sys.argv[1], sys.argv[2]

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

        # manifest: id -> href  (handle either attribute order)
        manifest = {}
        for mid, href in re.findall(
            r'<item\b[^>]*?\bid="([^"]+)"[^>]*?\bhref="([^"]+)"', opf
        ):
            manifest[mid] = href
        for href, mid in re.findall(
            r'<item\b[^>]*?\bhref="([^"]+)"[^>]*?\bid="([^"]+)"', opf
        ):
            manifest.setdefault(mid, href)

        spine = re.findall(r'<itemref\b[^>]*?\bidref="([^"]+)"', opf)
        ordered_hrefs = [manifest[s] for s in spine if s in manifest] or list(
            manifest.values()
        )

        parts, seen = [], set()
        for href in ordered_hrefs:
            path = posixpath.normpath(posixpath.join(base, href)) if base else href
            if path in seen or not re.search(r"\.x?html?$", path, re.I):
                continue
            seen.add(path)
            try:
                raw = z.read(path).decode("utf-8", "replace")
            except KeyError:
                continue
            text = strip_html(raw)
            if text:
                parts.append(text)

        meta = [
            ("TITLE", first_group(r"<dc:title[^>]*>(.*?)</dc:title>", opf)),
            ("AUTHOR", first_group(r"<dc:creator[^>]*>(.*?)</dc:creator>", opf)),
            ("DATE", first_group(r"<dc:date[^>]*>(.*?)</dc:date>", opf)),
            ("IDENTIFIER", first_group(r"<dc:identifier[^>]*>(.*?)</dc:identifier>", opf)),
        ]

    header = "\n".join(f"{k}: {v}" for k, v in meta if v)
    body = "\n\n".join(parts)
    with open(out, "w", encoding="utf-8") as fh:
        if header:
            fh.write(header + "\n\n" + "=" * 40 + "\n\n")
        fh.write(body + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
