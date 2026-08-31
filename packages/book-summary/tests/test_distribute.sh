#!/usr/bin/env bash
# distribute.sh: files land in Drive + vault, cover copied, MOC sorted & idempotent.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$HERE/../skills/book-summary/scripts/distribute.sh"

work="$(mktemp -d)"; drive="$(mktemp -d)"; vault="$(mktemp -d)"
trap 'rm -rf "$work" "$drive" "$vault"' EXIT

cat > "$work/config.json" <<EOF
{ "gdrive_dir": "$drive", "obsidian_vault": "$vault",
  "obsidian_books_subdir": "Books", "obsidian_attachments_subdir": "Books/attachments",
  "moc_file": "Books/Books MOC.md" }
EOF
export BOOK_SUMMARY_CONFIG="$work/config.json"

mk() {
  printf -- '---\ntitle: "%s"\nhook: "%s"\n---\n# %s\n' "$1" "${2:-}" "$1" > "$work/$1.md"
  printf '%%PDF-1.4 fake\n' > "$work/$1.pdf"
}
mk "Zed Author - Zzz Book"
printf 'PNG' > "$work/Zed Author - Zzz Book.jpg"
mk "Ada Author - Aaa Book" "first hook"

"$DIST" "$work/Zed Author - Zzz Book.md"  "$work/Zed Author - Zzz Book.pdf"  >/dev/null
"$DIST" "$work/Ada Author - Aaa Book.md"  "$work/Ada Author - Aaa Book.pdf"  >/dev/null
mk "Ada Author - Aaa Book" "second hook"                                    # edit the hook
"$DIST" "$work/Ada Author - Aaa Book.md"  "$work/Ada Author - Aaa Book.pdf"  >/dev/null  # rerun

fail=0
chk() { if [ "$1" ]; then :; fi; }
[ -f "$drive/Zed Author - Zzz Book.md" ]  || { echo "FAIL drive md"; fail=1; }
[ -f "$drive/Zed Author - Zzz Book.pdf" ] || { echo "FAIL drive pdf"; fail=1; }
[ -f "$drive/Zed Author - Zzz Book.jpg" ] || { echo "FAIL drive cover"; fail=1; }
[ -f "$vault/Books/Ada Author - Aaa Book.md" ] || { echo "FAIL vault md"; fail=1; }
[ -f "$vault/Books/attachments/Ada Author - Aaa Book.pdf" ] || { echo "FAIL vault pdf"; fail=1; }

moc="$vault/Books/Books MOC.md"
lines="$(grep -c '^- \[\[' "$moc")"
[ "$lines" -eq 2 ] || { echo "FAIL moc line count: $lines (want 2)"; fail=1; }
first="$(grep '^- \[\[' "$moc" | head -1)"
[ "$first" = "- [[Ada Author - Aaa Book]] — second hook" ] \
  || { echo "FAIL moc line (sort/hook/idempotent): $first"; fail=1; }
grep -q '^- \[\[Zed Author - Zzz Book\]\]$' "$moc" \
  || { echo "FAIL moc: hookless entry malformed"; fail=1; }

if [ "$fail" -eq 0 ]; then echo "test_distribute.sh: OK"; else exit 1; fi
