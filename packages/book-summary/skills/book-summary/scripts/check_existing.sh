#!/usr/bin/env bash
# Report whether a summary with this stem already exists in Drive or the vault,
# so the skill can ask before overwriting.
# Usage: check_existing.sh "<Author> - <Title>"
set -uo pipefail

STEM="${1:?usage: check_existing.sh \"<Author> - <Title>\"}"
CONFIG="${BOOK_SUMMARY_CONFIG:-$HOME/.config/book-summary/config.json}"
[ -f "$CONFIG" ] || { echo "no config at $CONFIG"; exit 0; }

cfg() {
  /usr/bin/env python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
print(d.get(sys.argv[2],"") or "")' "$CONFIG" "$1"
}

GDRIVE_DIR="$(cfg gdrive_dir)"
VAULT="$(cfg obsidian_vault)"
BOOKS_SUB="$(cfg obsidian_books_subdir)"; BOOKS_SUB="${BOOKS_SUB:-Books}"

found=0
for f in "$GDRIVE_DIR/$STEM.md" "$GDRIVE_DIR/$STEM.pdf"; do
  [ -n "$GDRIVE_DIR" ] && [ -f "$f" ] && { echo "EXISTS (drive): $f"; found=1; }
done
if [ -n "$VAULT" ]; then
  [ -f "$VAULT/$BOOKS_SUB/$STEM.md" ] && { echo "EXISTS (vault): $VAULT/$BOOKS_SUB/$STEM.md"; found=1; }
fi
[ "$found" -eq 0 ] && echo "none — safe to write"
exit 0
