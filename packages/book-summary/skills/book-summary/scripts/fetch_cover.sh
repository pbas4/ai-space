#!/usr/bin/env bash
# Download a cover image. Use only after confirming with the user (it fetches
# from the network). For EPUBs, epub_to_text.py already extracts the embedded
# cover with no network access — prefer that.
#
# Usage: fetch_cover.sh <url> <dest-path-without-extension>
set -euo pipefail

URL="${1:?usage: fetch_cover.sh <url> <dest-without-ext>}"
DEST="${2:?usage: fetch_cover.sh <url> <dest-without-ext>}"

case "$URL" in
  https://covers.openlibrary.org/*|https://*.gstatic.com/*|https://books.google.com/*) ;;
  https://*) ;;
  *) echo "Refusing non-https URL: $URL" >&2; exit 1 ;;
esac

tmp="$(mktemp)"
curl -fsSL --max-time 20 -o "$tmp" "$URL"
# sniff type
sig="$(xxd -p -l 4 "$tmp" 2>/dev/null || true)"
case "$sig" in
  ffd8ff*)   ext=jpg ;;
  89504e47)  ext=png ;;
  *)         ext=jpg ;;
esac
bytes="$(wc -c < "$tmp" | tr -d ' ')"
if [ "$bytes" -lt 1000 ]; then
  echo "Downloaded file is only ${bytes}B — probably a 'no cover' placeholder; skipping." >&2
  rm -f "$tmp"; exit 1
fi
mv "$tmp" "$DEST.$ext"
echo "Wrote $DEST.$ext (${bytes} bytes)"
