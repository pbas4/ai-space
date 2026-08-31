#!/usr/bin/env bash
# Copy a summary (.md + .pdf) to Google Drive and, if configured, an Obsidian vault.
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
BOOKS_SUB="$(cfg obsidian_books_subdir)";        BOOKS_SUB="${BOOKS_SUB:-Books}"
ATT_SUB="$(cfg obsidian_attachments_subdir)";    ATT_SUB="${ATT_SUB:-$BOOKS_SUB/attachments}"
MOC="$(cfg moc_file)";                           MOC="${MOC:-$BOOKS_SUB/Books MOC.md}"

base="$(basename "${MD%.*}")"

# --- Google Drive -----------------------------------------------------------
[ -n "$GDRIVE_DIR" ] || { echo "gdrive_dir not set in $CONFIG" >&2; exit 1; }
[ -d "$GDRIVE_DIR" ] || {
  echo "gdrive_dir does not exist: $GDRIVE_DIR" >&2
  echo "Is Google Drive for Desktop running and the folder synced?" >&2
  exit 1
}
cp -f "$MD"  "$GDRIVE_DIR/"
cp -f "$PDF" "$GDRIVE_DIR/"
echo "Google Drive : $GDRIVE_DIR/$(basename "$MD")"
echo "Google Drive : $GDRIVE_DIR/$(basename "$PDF")"

# --- Obsidian (optional) --------------------------------------------------
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

mocpath="$VAULT/$MOC"
mkdir -p "$(dirname "$mocpath")"
touch "$mocpath"
line="- [[$base]]"
grep -qF -- "$line" "$mocpath" || printf '%s\n' "$line" >> "$mocpath"

echo "Obsidian     : $VAULT/$BOOKS_SUB/$(basename "$MD")"
echo "Obsidian     : $VAULT/$ATT_SUB/$(basename "$PDF")"
echo "Obsidian MOC : $mocpath"
