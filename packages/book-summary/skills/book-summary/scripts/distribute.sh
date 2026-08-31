#!/usr/bin/env bash
# Copy a summary (.md + .pdf [+ cover]) to Google Drive and, if configured, an
# Obsidian vault. Idempotent: re-running overwrites files and keeps the MOC
# list sorted and duplicate-free.
# Usage: distribute.sh <summary.md> <summary.pdf>
set -euo pipefail

MD="${1:?usage: distribute.sh <summary.md> <summary.pdf>}"
PDF="${2:?usage: distribute.sh <summary.md> <summary.pdf>}"
CONFIG="${BOOK_SUMMARY_CONFIG:-$HOME/.config/book-summary/config.json}"

[ -f "$MD" ]  || { echo "Not found: $MD" >&2; exit 1; }
[ -f "$PDF" ] || { echo "Not found: $PDF" >&2; exit 1; }
[ -f "$CONFIG" ] || {
  echo "Config not found at $CONFIG" >&2
  echo "Copy packages/book-summary/config.example.json there and fill in gdrive_dir." >&2
  exit 1
}

cfg() {
  /usr/bin/env python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
print(d.get(sys.argv[2],"") or "")' "$CONFIG" "$1"
}

GDRIVE_DIR="$(cfg gdrive_dir)"
VAULT="$(cfg obsidian_vault)"
BOOKS_SUB="$(cfg obsidian_books_subdir)";     BOOKS_SUB="${BOOKS_SUB:-Books}"
ATT_SUB="$(cfg obsidian_attachments_subdir)"; ATT_SUB="${ATT_SUB:-$BOOKS_SUB/attachments}"
MOC="$(cfg moc_file)";                        MOC="${MOC:-$BOOKS_SUB/Books MOC.md}"

srcdir="$(cd "$(dirname "$MD")" && pwd)"
stem="$(basename "${MD%.*}")"
cover=""
for ext in jpg jpeg png webp; do
  if [ -f "$srcdir/$stem.$ext" ]; then cover="$srcdir/$stem.$ext"; break; fi
  if [ -f "$srcdir/cover.$ext" ]; then cover="$srcdir/cover.$ext"; break; fi
done

# --- Google Drive ---------------------------------------------------------
[ -n "$GDRIVE_DIR" ] || { echo "gdrive_dir not set in $CONFIG" >&2; exit 1; }
[ -d "$GDRIVE_DIR" ] || {
  echo "gdrive_dir does not exist: $GDRIVE_DIR" >&2
  echo "Is Google Drive for Desktop running and the folder synced?" >&2
  exit 1
}
cp -f "$MD"  "$GDRIVE_DIR/"
cp -f "$PDF" "$GDRIVE_DIR/"
[ -n "$cover" ] && cp -f "$cover" "$GDRIVE_DIR/$stem.${cover##*.}"
echo "Google Drive : $GDRIVE_DIR/$(basename "$MD")"
echo "Google Drive : $GDRIVE_DIR/$(basename "$PDF")"
[ -n "$cover" ] && echo "Google Drive : $GDRIVE_DIR/$stem.${cover##*.}"

# --- Obsidian (optional) ----------------------------------------------
if [ -z "$VAULT" ]; then
  echo "Obsidian     : not configured (set obsidian_vault in $CONFIG to enable)"
  exit 0
fi
if [ ! -d "$VAULT" ]; then
  echo "WARNING: obsidian_vault set but not found: $VAULT — skipped vault delivery." >&2
  exit 0
fi

mkdir -p "$VAULT/$BOOKS_SUB" "$VAULT/$ATT_SUB"
cp -f "$MD"  "$VAULT/$BOOKS_SUB/"
cp -f "$PDF" "$VAULT/$ATT_SUB/"
[ -n "$cover" ] && cp -f "$cover" "$VAULT/$ATT_SUB/$stem.${cover##*.}"

# MOC: keep any leading non-list header, then a sorted unique list of links.
mocpath="$VAULT/$MOC"
mkdir -p "$(dirname "$mocpath")"
touch "$mocpath"
newline="- [[$stem]]"
/usr/bin/env python3 - "$mocpath" "$newline" <<'PY'
import sys
path, newline = sys.argv[1], sys.argv[2]
lines = open(path, encoding="utf-8").read().splitlines()
header, links = [], set()
for ln in lines:
    if ln.strip().startswith("- [[") and ln.strip().endswith("]]"):
        links.add(ln.strip())
    elif ln.strip() or header:
        header.append(ln)
links.add(newline.strip())
while header and not header[-1].strip():
    header.pop()
out = []
if header:
    out += header + [""]
out += sorted(links, key=str.lower)
open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
PY

echo "Obsidian     : $VAULT/$BOOKS_SUB/$(basename "$MD")"
echo "Obsidian     : $VAULT/$ATT_SUB/$(basename "$PDF")"
[ -n "$cover" ] && echo "Obsidian     : $VAULT/$ATT_SUB/$stem.${cover##*.}"
echo "Obsidian MOC : $mocpath"
