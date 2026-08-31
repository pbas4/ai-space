#!/usr/bin/env bash
# Report whether a summary with this stem already exists in Drive or the vault,
# so the skill can ask before overwriting. Matches loosely: case-insensitive and
# ignoring spaces and punctuation, so "M.J. DeMarco - X" finds "M. J. DeMarco - X".
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

# Print every .md/.pdf in $1 whose normalized stem equals the target's.
scan() {
  local dir="$1" label="$2"
  [ -n "$dir" ] && [ -d "$dir" ] || return 0
  /usr/bin/env python3 - "$dir" "$label" "$STEM" <<'PY'
import os, re, sys
dir_, label, stem = sys.argv[1], sys.argv[2], sys.argv[3]
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
target = norm(stem)
for name in sorted(os.listdir(dir_)):
    root, ext = os.path.splitext(name)
    if ext.lower() in (".md", ".pdf") and norm(root) == target:
        print("EXISTS (%s): %s" % (label, os.path.join(dir_, name)))
PY
}

found="$( { scan "$GDRIVE_DIR" drive; [ -n "$VAULT" ] && scan "$VAULT/$BOOKS_SUB" vault; } )"
if [ -n "$found" ]; then
  printf '%s\n' "$found"
else
  echo "none — safe to write"
fi
exit 0
