#!/usr/bin/env python3
"""Split extracted book text into ordered chunks for summarizing.

Usage:
  split.py <book.txt> <out_dir> [--max-words N] [--only RANGES]

Strategy:
  1. If the text contains "## CHAPTER: <title>" markers (added by epub_to_text.py),
     split on those.
  2. Otherwise, look for heading-like lines (e.g. "Chapter 4", "CHAPTER IV",
     "PART TWO") and split on those.
  3. Otherwise, split into ~max-words windows on paragraph boundaries.

Any chunk longer than 1.6 * max-words is further divided into windows so no
single chunk is too big to summarize comfortably.

Writes:  <out_dir>/000-<slug>.txt, 001-..., and <out_dir>/index.json
--only 1-3,7 keeps just those chunk numbers (1-based) after splitting.
"""
import json
import os
import re
import sys

MARKER = re.compile(r"^## CHAPTER:\s*(.+?)\s*$", re.M)
HEADING = re.compile(
    r"^\s*(?:(?:chapter|chapitre|kapitel|capitulo|cap[ií]tulo)\s+[0-9ivxlcdm]+"
    r"|part\s+[0-9ivxlcdm]+|[0-9]{1,3})\s*[.:)]?\s*(.{0,80})$",
    re.I,
)


def slug(s: str, n: int = 40) -> str:
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    s = re.sub(r"[\s_-]+", "-", s)
    return (s[:n].rstrip("-")) or "section"


def parse_ranges(spec: str):
    keep = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            keep.update(range(int(a), int(b) + 1))
        elif part:
            keep.add(int(part))
    return keep


def windows(title, text, max_words):
    # break on blank lines, but hard-split any single paragraph that alone
    # exceeds the target (rare, but keeps one giant unbroken block from
    # becoming one giant chunk)
    paras = []
    for p in re.split(r"\n\s*\n", text):
        w = p.split()
        if len(w) > max_words:
            for k in range(0, len(w), max_words):
                paras.append(" ".join(w[k:k + max_words]))
        else:
            paras.append(p)

    cur, count, out = [], 0, []
    for p in paras:
        w = len(p.split())
        if count + w > max_words and cur:
            out.append("\n\n".join(cur))
            cur, count = [], 0
        cur.append(p)
        count += w
    if cur:
        out.append("\n\n".join(cur))
    if len(out) == 1:
        return [(title, out[0])]
    return [("%s (part %d/%d)" % (title or "Section", i + 1, len(out)), t)
            for i, t in enumerate(out)]


def consolidate(segs, target):
    """Merge consecutive small segments so each group is close to `target` words.

    Keeps a "## <title>" line at the top of every original piece it merges in, so
    the real section boundaries survive inside the chunk for later passes. The
    group's index title is its first piece's title, with "(+N sections)" when it
    absorbed more.
    """
    out = []
    titles, bodies, words = [], [], 0

    def flush():
        nonlocal titles, bodies, words
        if bodies:
            head = titles[0] or "Section"
            if len(titles) > 1:
                head = "%s (+%d sections)" % (head, len(titles) - 1)
            out.append((head, "\n\n".join(bodies)))
        titles, bodies, words = [], [], 0

    for title, body in segs:
        body = body.strip()
        if not body:
            continue
        w = len(body.split())
        if words and words + w > target and words >= target * 0.5:
            flush()
        titles.append(title)
        bodies.append(("## %s\n\n%s" % (title, body)) if title else body)
        words += w
        if words >= target:
            flush()
    flush()
    return out


def segment(text, max_words):
    marks = list(MARKER.finditer(text))
    if len(marks) >= 2:
        segs = []
        for i, m in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
            segs.append((m.group(1), text[m.end():end].strip()))
        pre = text[: marks[0].start()].strip()
        if len(pre.split()) > 200:
            segs.insert(0, ("Front matter", pre))
        return consolidate(segs, max_words)

    lines = text.split("\n")
    idx = [i for i, ln in enumerate(lines) if HEADING.match(ln) and len(ln.strip()) < 90]
    if len(idx) >= 3:
        segs, idx = [], idx + [len(lines)]
        if idx[0] > 0:
            head = "\n".join(lines[: idx[0]]).strip()
            if len(head.split()) > 200:
                segs.append(("Front matter", head))
        for a, b in zip(idx, idx[1:]):
            title = lines[a].strip()
            segs.append((title, "\n".join(lines[a + 1:b]).strip()))
        return consolidate(segs, max_words)

    return [(None, text)]


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    src, out_dir = args[0], args[1]
    max_words = 8000
    only = None
    i = 2
    while i < len(args):
        if args[i] == "--max-words":
            max_words = int(args[i + 1]); i += 2
        elif args[i] == "--only":
            only = parse_ranges(args[i + 1]); i += 2
        else:
            print("unknown arg: %s" % args[i], file=sys.stderr); return 2

    with open(src, encoding="utf-8") as fh:
        text = fh.read()
    text = re.sub(r"^.*?\n={20,}\n\n", "", text, count=1, flags=re.S)  # drop meta header

    raw_segs = segment(text, max_words)
    chunks = []
    for title, body in raw_segs:
        if not body.strip():
            continue
        if len(body.split()) > int(max_words * 1.6):
            chunks.extend(windows(title, body, max_words))
        else:
            chunks.append((title, body))

    os.makedirs(out_dir, exist_ok=True)
    index = []
    written = 0
    for n, (title, body) in enumerate(chunks, 1):
        if only is not None and n not in only:
            continue
        name = "%03d-%s.txt" % (n - 1, slug(title or "section"))
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as fh:
            fh.write(body + "\n")
        index.append({"n": n, "file": name, "title": title, "words": len(body.split())})
        written += 1

    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, indent=2, ensure_ascii=False)

    total = sum(e["words"] for e in index)
    print("split into %d chunk(s), %d words total -> %s" % (written, total, out_dir))
    for e in index:
        print("  %2d  %6dw  %s" % (e["n"], e["words"], e["title"] or "(untitled)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
