#!/usr/bin/env bash
# Extract plain text from a book or document.
# Usage: extract.sh <input> <out.txt>
#   <input> may be a local .epub .pdf .txt .md .markdown .docx .html .htm file,
#   or an http(s):// URL (best-effort readable text; no JavaScript rendering).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IN="${1:?usage: extract.sh <input> <out.txt>}"
OUT="${2:?usage: extract.sh <input> <out.txt>}"

mkdir -p "$(dirname "$OUT")"

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "$1 not found. $2" >&2; exit 1; }
}

case "$IN" in
  http://*|https://*)
    need curl "It ships with macOS."
    need pandoc "Run: brew install pandoc"
    tmp_html="$(mktemp)"
    curl -fsSL --max-time 30 -A "Mozilla/5.0 (book-summary skill)" "$IN" -o "$tmp_html"
    pandoc -f html -t markdown --wrap=none "$tmp_html" -o "$OUT"
    rm -f "$tmp_html"
    ;;
  *)
    [ -f "$IN" ] || { echo "Input not found: $IN" >&2; exit 1; }
    ext="$(printf '%s' "${IN##*.}" | tr '[:upper:]' '[:lower:]')"
    case "$ext" in
      epub)
        /usr/bin/env python3 "$SCRIPT_DIR/epub_to_text.py" "$IN" "$OUT"
        ;;
      pdf)
        need pdftotext "Run: brew install poppler"
        pdftotext -layout -enc UTF-8 "$IN" "$OUT"
        ;;
      txt|text|md|markdown)
        cp "$IN" "$OUT"
        ;;
      docx)
        need pandoc "Run: brew install pandoc"
        pandoc -f docx -t plain --wrap=none "$IN" -o "$OUT"
        ;;
      html|htm|xhtml)
        need pandoc "Run: brew install pandoc"
        pandoc -f html -t markdown --wrap=none "$IN" -o "$OUT"
        ;;
      *)
        echo "Unsupported input: .$ext (epub, pdf, txt, md, docx, html, or an http(s) URL)" >&2
        exit 1
        ;;
    esac
    ;;
esac

chars=$(wc -m < "$OUT" | tr -d ' ')
words=$(wc -w < "$OUT" | tr -d ' ')
echo "Extracted ~$words words ($chars chars) -> $OUT"
if [ "$chars" -lt 2000 ]; then
  echo "WARNING: very little text extracted." >&2
  case "$IN" in
    *.pdf) echo "         A PDF this sparse is usually scanned; OCR first:  ocrmypdf \"$IN\" ocr.pdf" >&2 ;;
    http*) echo "         The page may be JavaScript-rendered; save it as HTML/PDF from the browser and pass that file." >&2 ;;
  esac
fi
