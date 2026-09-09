#!/usr/bin/env python3
"""Collect a reader's own highlights for one book into highlights.md.

Sources (any combination):
  --kindle  <My Clippings.txt>     Kindle "My Clippings.txt"
  --readwise-md <export.md>        Readwise / Obsidian markdown export
  --readwise-csv <export.csv>      Readwise CSV export

Always pass --title "<book title>" so entries for other books are filtered out
(fuzzy match on a normalized title; --author narrows it further).

Writes a markdown list to --out (default: stdout):
  > highlighted text — <location>
      note: <the reader's note, if any>
and prints "<n> highlights" to stderr. Exit 0 even with zero matches.
"""
import argparse
import csv
import re
import sys


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (s or "").lower())).strip()


def title_matches(candidate: str, want_title: str, want_author: str) -> bool:
    c, t = norm(candidate), norm(want_title)
    if not t:
        return True
    if t in c or c in t:
        ok = True
    else:
        ct, tt = set(c.split()), set(t.split())
        ok = bool(tt) and len(ct & tt) / len(tt) >= 0.6
    if ok and want_author:
        a = norm(want_author).split()
        if a and not any(tok in c for tok in a):
            # author given but not present in the same line/context — keep anyway
            # unless the title match was weak
            return t in c or c in t
    return ok


def parse_kindle(path, title, author):
    raw = open(path, encoding="utf-8-sig", errors="replace").read()
    out = []
    for entry in raw.split("=========="):
        lines = [ln.rstrip() for ln in entry.strip("\n").splitlines()]
        if len(lines) < 3:
            continue
        head, meta = lines[0].strip(), lines[1].strip()
        body = "\n".join(lines[2:]).strip()
        if not body or not title_matches(head, title, author):
            continue
        low = meta.lower()
        kind = "note" if "your note" in low else "bookmark" if "your bookmark" in low else "highlight"
        if kind == "bookmark":
            continue
        loc = ""
        m = re.search(r"location\s+([0-9\-]+)", low)
        if m:
            loc = "Location " + m.group(1)
        else:
            m = re.search(r"page\s+([0-9ivxlc\-]+)", low)
            if m:
                loc = "page " + m.group(1)
        out.append({"text": body, "location": loc, "note": body if kind == "note" else "", "kind": kind})
    # attach standalone notes to the preceding highlight when possible
    merged = []
    for h in out:
        if h["kind"] == "note" and merged:
            merged[-1]["note"] = h["text"]
        else:
            merged.append(h)
    return [h for h in merged if h["kind"] != "note"]


def parse_readwise_md(path, title, author):
    text = open(path, encoding="utf-8", errors="replace").read()
    # Split into per-book sections on H1; a single-book export has one section.
    sections = re.split(r"(?m)^#\s+(?!#)(.+)$", text)
    blocks = []
    if len(sections) == 1:
        blocks = [("", sections[0])]
    else:
        it = iter(sections[1:])
        blocks = list(zip(it, it))
    out = []
    for btitle, body in blocks:
        if btitle and not title_matches(btitle, title, author):
            continue
        hl = re.search(r"(?mis)^##+\s*Highlights\s*$(.*)", body)
        region = hl.group(1) if hl else body
        for m in re.finditer(r"(?m)^[-*]\s+(.+?)\s*$", region):
            t, loc = m.group(1).strip(), ""
            if not t or t.lower().startswith(("author:", "full title:", "category:", "tags:", "url:")):
                continue
            # trailing markdown-link citation:  ([Location 1234](https://…))
            mc = re.search(r"\s*\(\[([^\]]+)\]\([^)]*\)\)\s*$", t)
            if mc:
                loc, t = mc.group(1).strip(), t[: mc.start()].strip()
            else:  # trailing plain citation:  (Location 1234) / (page 12)
                mc = re.search(r"\s*\(([^()]{1,40})\)\s*$", t)
                if mc and re.search(r"\d", mc.group(1)):
                    loc, t = mc.group(1).strip(), t[: mc.start()].strip()
            if t:
                out.append({"text": t, "location": loc, "note": "", "kind": "highlight"})
    return out


def parse_readwise_csv(path, title, author):
    out = []
    with open(path, encoding="utf-8", errors="replace", newline="") as fh:
        for row in csv.DictReader(fh):
            bt = row.get("Book Title") or row.get("Title") or ""
            if not title_matches(bt, title, author):
                continue
            t = (row.get("Highlight") or "").strip()
            if not t:
                continue
            loc = (row.get("Location") or "").strip()
            ltype = (row.get("Location Type") or "location").strip().lower()
            if loc and ltype:
                loc = f"{ltype.capitalize()} {loc}"
            out.append({"text": t, "location": loc, "note": (row.get("Note") or "").strip(), "kind": "highlight"})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--kindle")
    ap.add_argument("--readwise-md", dest="readwise_md")
    ap.add_argument("--readwise-csv", dest="readwise_csv")
    ap.add_argument("--title", default="")
    ap.add_argument("--author", default="")
    ap.add_argument("--out")
    a = ap.parse_args()

    if not (a.kindle or a.readwise_md or a.readwise_csv):
        ap.error("give at least one of --kindle / --readwise-md / --readwise-csv")

    items, sources = [], []
    try:
        if a.kindle:
            k = parse_kindle(a.kindle, a.title, a.author)
            items += k
            sources.append(f"{len(k)} from Kindle")
        if a.readwise_md:
            r = parse_readwise_md(a.readwise_md, a.title, a.author)
            items += r
            sources.append(f"{len(r)} from Readwise md")
        if a.readwise_csv:
            r = parse_readwise_csv(a.readwise_csv, a.title, a.author)
            items += r
            sources.append(f"{len(r)} from Readwise csv")
    except FileNotFoundError as e:
        print(f"highlights: {e}", file=sys.stderr)
        return 1

    # de-dupe on normalized text, keep first (with location)
    seen, uniq = set(), []
    for h in items:
        key = norm(h["text"])[:200]
        if key and key not in seen:
            seen.add(key)
            uniq.append(h)

    lines = [f"<!-- reader highlights: {', '.join(sources) or '0'}; {len(uniq)} unique -->"]
    for h in uniq:
        loc = f" — {h['location']}" if h["location"] else ""
        lines.append(f"> {h['text']}{loc}")
        if h["note"]:
            lines.append(f"    note: {h['note']}")
    body = "\n".join(lines) + "\n"

    if a.out:
        open(a.out, "w", encoding="utf-8").write(body)
    else:
        sys.stdout.write(body)
    print(f"{len(uniq)} highlights", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
