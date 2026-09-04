#!/usr/bin/env bash
# Render a summary Markdown file to the house-style PDF.
# Usage: render_pdf.sh <summary.md> <out.pdf>
#
# PDF engine, in order of preference:
#   typst       - single static binary, no system libs   (brew install typst)
#   weasyprint  - CSS renderer, needs pango/cairo         (brew install weasyprint)
#   wkhtmltopdf - last resort
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
CSS="$SKILL_DIR/assets/pdf-style.css"

IN="${1:?usage: render_pdf.sh <summary.md> <out.pdf>}"
OUT="${2:?usage: render_pdf.sh <summary.md> <out.pdf>}"

command -v pandoc >/dev/null 2>&1 \
  || { echo "pandoc not found. Run: brew install pandoc" >&2; exit 1; }
[ -f "$IN" ] || { echo "Input not found: $IN" >&2; exit 1; }

srcdir="$(cd "$(dirname "$IN")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Copy the source into a scratch dir, rewriting Obsidian image embeds
#   ![[Some Name.jpg|200]]   ->   ![](cover.jpg)
# to a plain Markdown image pointing at a space-free copy, so pandoc (which
# URL-encodes paths) can actually find the file. Other lines pass through.
doc="$work/doc.md"
n=0
while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" =~ ^\!\[\[(.+)\]\]$ ]]; then
    target="${BASH_REMATCH[1]%%|*}"          # drop "|200" sizing hint
    if [ -f "$srcdir/$target" ]; then
      ext="${target##*.}"; n=$((n + 1))
      asset="asset-$n.$ext"; [ "$n" -eq 1 ] && asset="cover.$ext"
      cp "$srcdir/$target" "$work/$asset"
      printf '![](%s)\n' "$asset" >> "$doc"
      continue
    fi
  fi
  printf '%s\n' "$line" >> "$doc"
done < "$IN"

common=( "$doc" --from=gfm+yaml_metadata_block --standalone
         --resource-path "$work" --metadata pagetitle="$(basename "${IN%.*}")"
         --output "$OUT" )

if command -v typst >/dev/null 2>&1; then
  # linkcolor is fed straight into typst's rgb(): must be hex, not a name.
  pandoc "${common[@]}" \
    --pdf-engine=typst \
    -V fontsize=11pt -V margin-x=20mm -V margin-y=22mm \
    -V linkcolor=1a1a1a
  engine=typst
elif command -v weasyprint >/dev/null 2>&1; then
  pandoc "${common[@]}" --pdf-engine=weasyprint --css "$CSS"
  engine=weasyprint
elif command -v wkhtmltopdf >/dev/null 2>&1; then
  pandoc "${common[@]}" --pdf-engine=wkhtmltopdf --css "$CSS"
  engine=wkhtmltopdf
else
  echo "No PDF engine found. Run: brew install typst   (or weasyprint)" >&2
  exit 1
fi

echo "Wrote $OUT (engine: $engine)"
