#!/usr/bin/env bash
# Verify the tools book-summary needs are installed.
set -uo pipefail

missing=0
need() {
  if command -v "$1" >/dev/null 2>&1; then
    printf '  ok    %-11s %s\n' "$1" "$(command -v "$1")"
  else
    printf '  MISS  %-11s -> %s\n' "$1" "$2"
    missing=1
  fi
}

echo "book-summary dependency check"
echo
need pdftotext  "brew install poppler"
need pandoc     "brew install pandoc"
need weasyprint "brew install weasyprint   (or: pipx install weasyprint)"
need python3    "xcode-select --install"
echo

if [ "$missing" -ne 0 ]; then
  echo "Install the MISS items, then re-run. Fresh Mac one-liner:"
  echo "  brew install poppler pandoc weasyprint"
  exit 1
fi

echo "All required tools present."
command -v ocrmypdf >/dev/null 2>&1 \
  || echo "(optional) ocrmypdf missing — only needed for scanned PDFs: brew install ocrmypdf"
