#!/usr/bin/env bash
# Verify the tools book-summary needs are installed.
set -uo pipefail

miss_required=0
have() { command -v "$1" >/dev/null 2>&1; }
row() {
  if have "$1"; then printf '  ok    %-11s %s\n' "$1" "$(command -v "$1")"
  else               printf '  MISS  %-11s -> %s\n' "$1" "$2"; return 1; fi
}

echo "book-summary dependency check"
echo
row pdftotext "brew install poppler" || miss_required=1
row pandoc    "brew install pandoc"  || miss_required=1
row python3   "xcode-select --install" || miss_required=1

echo
echo "PDF engine (need at least one):"
engine_ok=0
for e in typst weasyprint wkhtmltopdf; do
  if have "$e"; then printf '  ok    %s\n' "$e"; engine_ok=1; fi
done
if [ "$engine_ok" -eq 0 ]; then
  echo "  MISS  none -> brew install typst   (lightest; or: brew install weasyprint)"
  miss_required=1
fi

echo
if have ocrmypdf; then echo "optional ocrmypdf: ok (scanned PDFs)"
else echo "optional ocrmypdf: missing — only needed for scanned PDFs: brew install ocrmypdf"; fi

echo
if [ "$miss_required" -ne 0 ]; then
  echo "Install the MISS items, then re-run. Fresh Mac one-liner:"
  echo "  brew install poppler pandoc typst"
  exit 1
fi
echo "All required tools present."
