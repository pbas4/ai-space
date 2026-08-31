#!/usr/bin/env bash
# Render a summary Markdown file to the house-style PDF.
# Usage: render_pdf.sh <summary.md> <out.pdf>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
CSS="$SKILL_DIR/assets/pdf-style.css"

IN="${1:?usage: render_pdf.sh <summary.md> <out.pdf>}"
OUT="${2:?usage: render_pdf.sh <summary.md> <out.pdf>}"

command -v pandoc >/dev/null 2>&1 \
  || { echo "pandoc not found. Run: brew install pandoc" >&2; exit 1; }
command -v weasyprint >/dev/null 2>&1 \
  || { echo "weasyprint not found. Run: brew install weasyprint" >&2; exit 1; }
[ -f "$IN" ] || { echo "Input not found: $IN" >&2; exit 1; }

pandoc "$IN" \
  --from=gfm+yaml_metadata_block \
  --standalone \
  --pdf-engine=weasyprint \
  --css "$CSS" \
  --metadata pagetitle="$(basename "${IN%.*}")" \
  --output "$OUT"

echo "Wrote $OUT"
