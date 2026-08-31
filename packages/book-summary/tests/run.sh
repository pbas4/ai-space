#!/usr/bin/env bash
# Run the book-summary package test suite. No third-party deps.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== python unit tests =="
/usr/bin/env python3 -m unittest discover -s "$HERE" -p "test_*.py" -v

echo
echo "== shell tests =="
bash "$HERE/test_distribute.sh"

echo
echo "all book-summary tests passed"
