#!/usr/bin/env python3
"""Index an Obsidian vault's notes for related-note lookup.

Usage: vault_index.py <vault-dir> [--out <path>]

Walks <vault-dir>/**/*.md, reads each note's YAML frontmatter (title, tags,
topics, aliases), and writes a JSON array to <vault>/.book-summary-index.json
(or --out):

  [{"path": "...", "basename": "James Clear - Atomic Habits",
    "title": "Atomic Habits", "tags": ["book", "psychology", "habits"]}, ...]

`tags` is the merged, lowercased set of frontmatter tags + topics with any
"book/" prefix stripped ("book/finance" -> "finance"). Cheap; rerun each time.
Skips dotfiles and common non-note dirs.
"""
import json
import os
import re
import sys

SKIP_DIRS = {".git", ".obsidian", ".trash", "node_modules"}


def parse_list(val, lines, i):
    """Parse a YAML list value that is either inline [a, b] or a block of '- x'."""
    val = val.strip()
    if val.startswith("[") and val.endswith("]"):
        return [x.strip().strip("'\"") for x in val[1:-1].split(",") if x.strip()], i
    items = []
    j = i + 1
    while j < len(lines) and re.match(r"\s*-\s+", lines[j]):
        items.append(re.sub(r"\s*-\s+", "", lines[j], count=1).strip().strip("'\""))
        j += 1
    return items, j - 1


def frontmatter(text):
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    lines = text[3:end].splitlines()
    fm, i = {}, 0
    while i < len(lines):
        m = re.match(r"([A-Za-z0-9_-]+):(.*)", lines[i])
        if m:
            key, rest = m.group(1).lower(), m.group(2)
            if key in ("tags", "topics", "aliases"):
                fm[key], i = parse_list(rest, lines, i)
            else:
                fm[key] = rest.strip().strip("'\"")
        i += 1
    return fm


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__, file=sys.stderr)
        return 2
    vault = args[0]
    out = None
    if "--out" in args:
        out = args[args.index("--out") + 1]
    out = out or os.path.join(vault, ".book-summary-index.json")

    if not os.path.isdir(vault):
        print(f"not a directory: {vault}", file=sys.stderr)
        return 1

    index = []
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for name in files:
            if not name.endswith(".md"):
                continue
            path = os.path.join(root, name)
            try:
                text = open(path, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            fm = frontmatter(text)
            tags = set()
            for t in list(fm.get("tags", [])) + list(fm.get("topics", [])):
                t = str(t).strip().lower()
                if t.startswith("book/"):
                    t = t[5:]
                if t:
                    tags.add(t)
            index.append({
                "path": os.path.relpath(path, vault),
                "basename": os.path.splitext(name)[0],
                "title": fm.get("title") or os.path.splitext(name)[0],
                "tags": sorted(tags),
            })

    with open(out, "w", encoding="utf-8") as fh:
        json.dump(index, fh, indent=2, ensure_ascii=False)
    print(f"indexed {len(index)} notes -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
