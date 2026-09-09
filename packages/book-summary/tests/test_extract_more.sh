#!/usr/bin/env bash
# extract.sh: local .txt / .md / .html (+ .docx when pandoc is present) dispatch.
# The URL path is not exercised here (needs network); it is covered by manual QA.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTRACT="$HERE/../skills/book-summary/scripts/extract.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0

pad="$(printf 'lorem ipsum dolor sit amet %.0s' $(seq 1 120))"

# --- .txt / .md : pass-through --------------------------------------------
printf 'Plain text body with several words in it. %s\n' "$pad" > "$work/in.txt"
"$EXTRACT" "$work/in.txt" "$work/out_txt.txt" >/dev/null 2>&1
grep -q "Plain text body" "$work/out_txt.txt" || { echo "FAIL txt passthrough"; fail=1; }

printf '# Heading\n\nSome **markdown** prose here. %s\n' "$pad" > "$work/in.md"
"$EXTRACT" "$work/in.md" "$work/out_md.txt" >/dev/null 2>&1
grep -q "markdown" "$work/out_md.txt" || { echo "FAIL md passthrough"; fail=1; }

# --- .html : via pandoc --------------------------------------------------
if command -v pandoc >/dev/null 2>&1; then
  printf '<html><body><h1>Title</h1><p>Article paragraph one. %s</p></body></html>' "$pad" > "$work/in.html"
  "$EXTRACT" "$work/in.html" "$work/out_html.txt" >/dev/null 2>&1
  grep -q "Article paragraph one" "$work/out_html.txt" || { echo "FAIL html extract"; fail=1; }
else
  echo "skip: pandoc not installed (html/docx cases)"
fi

# --- unsupported extension is rejected --------------------------------
if "$EXTRACT" "$work/in.txt.zip" "$work/nope.txt" 2>/dev/null; then
  echo "FAIL: missing file should error"; fail=1
fi
printf 'x' > "$work/thing.rtf"
if "$EXTRACT" "$work/thing.rtf" "$work/nope2.txt" 2>/dev/null; then
  echo "FAIL: .rtf should be unsupported"; fail=1
fi

if [ "$fail" -eq 0 ]; then echo "test_extract_more.sh: OK"; else exit 1; fi
