#!/usr/bin/env python3
"""highlights.py: Kindle + Readwise parsing, title filtering, note attach, dedupe."""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "skills", "book-summary", "scripts", "highlights.py")

KINDLE = """\
Atomic Habits (James Clear)
- Your Highlight on page 23 | Location 300-301 | Added on Monday

You do not rise to the level of your goals. You fall to the level of your systems.
==========
Atomic Habits (James Clear)
- Your Note on page 23 | Location 301 | Added on Monday

this is the core idea
==========
Some Other Book (Someone Else)
- Your Highlight on page 5 | Location 40-41 | Added on Tuesday

Irrelevant highlight from a different book.
==========
Atomic Habits (James Clear)
- Your Bookmark on page 99 | Location 1500 | Added on Friday

==========
"""

READWISE_MD = """\
# Atomic Habits
## Metadata
- Author: James Clear
- Full Title: Atomic Habits
## Highlights
- Habits are the compound interest of self-improvement. ([Location 240](https://readwise.io/x))
- Every action is a vote for the type of person you wish to become. ([Location 999](https://readwise.io/y))

# Unrelated Title
## Highlights
- Should not appear. ([Location 1](https://readwise.io/z))
"""


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def run(*args):
    return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True)


class Highlights(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.kindle = os.path.join(self.tmp, "My Clippings.txt")
        self.rw = os.path.join(self.tmp, "readwise.md")
        write(self.kindle, KINDLE)
        write(self.rw, READWISE_MD)

    def test_kindle_filters_by_title_and_attaches_note(self):
        out = os.path.join(self.tmp, "h.md")
        r = run("--kindle", self.kindle, "--title", "Atomic Habits", "--out", out)
        self.assertEqual(r.returncode, 0, r.stderr)
        body = read(out)
        self.assertIn("You fall to the level of your systems", body)
        self.assertIn("note: this is the core idea", body)
        self.assertNotIn("Irrelevant highlight", body)   # other book filtered
        self.assertNotIn("Bookmark", body)               # bookmarks dropped

    def test_readwise_md_section_filter_and_citation_stripped(self):
        out = os.path.join(self.tmp, "h2.md")
        run("--readwise-md", self.rw, "--title", "Atomic Habits", "--out", out)
        body = read(out)
        self.assertIn("compound interest of self-improvement. — Location 240", body)
        self.assertIn("Every action is a vote", body)
        self.assertNotIn("readwise.io", body)            # markdown link removed
        self.assertNotIn("Should not appear", body)

    def test_dedupe_across_sources(self):
        dup = os.path.join(self.tmp, "dup.md")
        write(dup, "# Atomic Habits\n## Highlights\n- You do not rise to the level of "
                   "your goals. You fall to the level of your systems. ([Location 300](x))\n")
        out = os.path.join(self.tmp, "h3.md")
        run("--kindle", self.kindle, "--readwise-md", dup,
            "--title", "Atomic Habits", "--out", out)
        self.assertEqual(read(out).count("fall to the level of your systems"), 1)

    def test_no_source_is_an_error(self):
        self.assertNotEqual(run("--title", "x").returncode, 0)


if __name__ == "__main__":
    unittest.main()
