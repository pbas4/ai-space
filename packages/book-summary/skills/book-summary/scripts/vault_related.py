#!/usr/bin/env python3
"""Rank existing vault notes related to the book being summarized.

Usage:
  vault_related.py --index <.book-summary-index.json> \
      --topics finance,psychology --title "Atomic Habits" \
      [--exclude "James Clear - Atomic Habits"] [--limit 8]

Scores each indexed note by tag/topic overlap plus fuzzy title-token overlap and
prints the top matches as Obsidian wiki-links, one per line:

  - [[Donella H. Meadows - Thinking in Systems]]

Only notes present in the index are printed, so every link resolves. Prints
nothing (exit 0) if there is no reasonable match — the caller then leaves
"How this connects" to plain prose.
"""
import json
import re
import sys


def toks(s):
    return set(re.sub(r"[^\w\s]", " ", (s or "").lower()).split())


STOP = {"the", "a", "an", "of", "and", "to", "in", "on", "for", "book", "summary", "notes"}


def main() -> int:
    a = sys.argv[1:]

    def opt(name, default=None):
        return a[a.index(name) + 1] if name in a else default

    index_path = opt("--index")
    if not index_path:
        print(__doc__, file=sys.stderr)
        return 2
    topics = {t.strip().lower() for t in (opt("--topics", "") or "").split(",") if t.strip()}
    title = opt("--title", "") or ""
    exclude = (opt("--exclude", "") or "").lower()
    limit = int(opt("--limit", "8"))

    try:
        index = json.load(open(index_path, encoding="utf-8"))
    except FileNotFoundError:
        print(f"index not found: {index_path}", file=sys.stderr)
        return 1

    title_tokens = toks(title) - STOP
    ranked = []
    for note in index:
        if note["basename"].lower() == exclude:
            continue
        ntags = {t.lower() for t in note.get("tags", [])}
        ntitle = toks(note.get("title", "")) | toks(note["basename"])
        ntitle -= STOP

        tag_hits = len(topics & ntags)
        title_hits = len(title_tokens & ntitle)
        if tag_hits == 0 and title_hits == 0:
            continue
        # weight shared topics higher than shared title words
        score = tag_hits * 3 + title_hits
        ranked.append((score, note["basename"]))

    ranked.sort(key=lambda x: (-x[0], x[1].lower()))
    for _, basename in ranked[:limit]:
        print(f"- [[{basename}]]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
