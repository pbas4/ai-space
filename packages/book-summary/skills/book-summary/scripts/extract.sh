#!/usr/bin/env bash
# Extract plain text from an EPUB or PDF book.
# Usage: extract.sh <book.epub|book.pdf> <out.txt>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IN="${1:?usage: extract.sh <book.epub|book.pdf> <out.txt>}"
OUT="${2:?usage: extract.sh <book.epub|book.pdf> <out.txt>}"

[ -f "$IN" ] || { echo "Input not found: $IN" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"

ext="$(printf '%s' "${IN##*.}" | tr '[:upper:]' '[:lower:]')"
case "$ext" in
  epub)
    /usr/bin/env python3 "$SCRIPT_DIR/epub_to_text.py" "$IN" "$OUT"
    ;;
  pdf)
    command -v pdftotext >/dev/null 2>&1 \
      || { echo "pdftotext not found. Run: brew install poppler" >&2; exit 1; }
    pdftotext -layout -enc UTF-8 "$IN" "$OUT"
    ;;
  *)
    echo "Unsupported extension: .$ext (need .epub or .pdf)" >&2
    exit 1
    ;;
esac

chars=$(wc -m < "$OUT" | tr -d ' ')
words=$(wc -w < "$OUT" | tr -d ' ')
echo "Extracted ~$words words ($chars chars) -> $OUT"
if [ "$chars" -lt 2000 ]; then
  echo "WARNING: very little text extracted. If this is a PDF it is probably scanned/" >&2
  echo "         image-only and needs OCR first:  ocrmypdf \"$IN\" ocr.pdf" >&2
fi
