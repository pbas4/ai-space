#!/usr/bin/env python3
"""Check that every blockquote in a summary appears in the source text.

Usage:
    verify_quotes.py <summary.md> <book.txt>

Reads Markdown blockquote lines (`> ...`) from the summary, strips the trailing
` — attribution` and any surrounding quote marks, normalizes whitespace / quote
glyphs / dashes, splits on `[...]` (or `[…]`) elisions, and checks that each
fragment longer than MIN_FRAGMENT chars occurs in the normalized source.

Prints one line per quote:
  PASS  found in the prose
  WARN  found only in a "## CHAPTER:" heading — it's a section title, not a
        quotable line; exit code is unaffected but pick a better quote
  FAIL  not found at all

Exits non-zero if any quote FAILed, so it can gate the render step. Offline; no
dependencies beyond the stdlib.
"""
from __future__ import annotations

import re
import sys
import unicodedata

MIN_FRAGMENT = 16  # shorter fragments are too generic to verify usefully

# Attribution separators that a quote line may end with:  > «...» — 4.ª parte
_ATTRIB_RE = re.compile(r"\s+[—–-]{1,2}\s+[^—–]*$")
_QUOTE_CHARS = "«»“”„‟‘’‹›\"'`"
_ELISION_RE = re.compile(r"\[\s*(?:\.\.\.|…)\s*\]|\.\.\.|…")
_WS_RE = re.compile(r"\s+")


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    # unify dashes and quote glyphs so wording differences, not typography, decide
    for ch in "‐‑‒–—―":
        text = text.replace(ch, "-")
    for ch in _QUOTE_CHARS:
        text = text.replace(ch, "'")
    text = text.replace("'", "'")
    return _WS_RE.sub(" ", text).strip().lower()


def extract_quotes(md: str) -> list[str]:
    quotes, buf = [], []
    for line in md.splitlines():
        if line.lstrip().startswith(">"):
            buf.append(line.lstrip()[1:].lstrip())
        elif buf:
            quotes.append(" ".join(buf).strip())
            buf = []
    if buf:
        quotes.append(" ".join(buf).strip())
    return [q for q in quotes if q]


def strip_attribution(quote: str) -> str:
    q = _ATTRIB_RE.sub("", quote).strip()
    return q.strip(_QUOTE_CHARS + " ")


def fragments(quote: str) -> list[str]:
    out = []
    for part in _ELISION_RE.split(quote):
        # trailing/leading sentence punctuation is the summariser's, not the
        # source's — trim it so a quote that legitimately ends in "." still
        # matches text that runs on. Wording differences are still caught.
        part = normalize(part).strip(".,;:!?¡¿ ")
        if part:
            out.append(part)
    return out


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    summary_path, book_path = argv[1], argv[2]
    with open(summary_path, encoding="utf-8") as fh:
        md = fh.read()
    with open(book_path, encoding="utf-8") as fh:
        raw = fh.read()
    haystack = normalize(raw)
    prose = normalize(re.sub(r"(?m)^## CHAPTER:.*$", " \n ", raw))

    quotes = extract_quotes(md)
    if not quotes:
        print("no blockquotes found — nothing to verify")
        return 0

    failed = warned = 0
    for quote in quotes:
        core = strip_attribution(quote)
        parts = fragments(core)
        checkable = [p for p in parts if len(p) >= MIN_FRAGMENT]
        shown = (core[:70] + "…") if len(core) > 71 else core
        if not checkable:
            print(f"SKIP  (too short to verify)  {shown}")
            continue
        missing = [p for p in checkable if p not in haystack]
        if missing:
            failed += 1
            frag = missing[0]
            frag = (frag[:60] + "…") if len(frag) > 61 else frag
            print(f"FAIL  {shown}\n      not found: {frag}")
        elif any(p not in prose for p in checkable):
            warned += 1
            print(f"WARN  {shown}\n      only matches a chapter heading — not a quotable line")
        else:
            print(f"PASS  {shown}")

    print()
    if warned:
        print(f"{warned} quote(s) match only a heading — consider replacing them.")
    if failed:
        print(f"{failed} quote(s) not found in source — fix wording or drop them.")
        return 1
    print(f"all {len(quotes)} quote(s) verified against source.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
