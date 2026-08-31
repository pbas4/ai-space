#!/usr/bin/env python3
"""epub_to_text.py: spine order, TOC chapter markers, metadata, cover."""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "skills", "book-summary", "scripts")
sys.path.insert(0, HERE)
import make_fixture_epub  # noqa: E402


class EpubExtract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.epub = make_fixture_epub.build(os.path.join(self.tmp, "fixture.epub"))
        self.out = os.path.join(self.tmp, "book.txt")
        subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "epub_to_text.py"), self.epub, self.out],
            check=True, capture_output=True, text=True,
        )
        with open(self.out, encoding="utf-8") as fh:
            self.text = fh.read()

    def test_metadata_header(self):
        self.assertIn("TITLE: The Fixture Book", self.text)
        self.assertIn("AUTHOR: Ada Testwright", self.text)
        self.assertIn("IDENTIFIER: urn:isbn:9780000000001", self.text)

    def test_toc_chapter_markers_in_order(self):
        for name in ("The Alpha Chapter", "The Beta Chapter", "The Gamma Chapter"):
            self.assertIn("## CHAPTER: %s" % name, self.text)
        pos = [self.text.index("## CHAPTER: " + n)
               for n in ("The Alpha Chapter", "The Beta Chapter", "The Gamma Chapter")]
        self.assertEqual(pos, sorted(pos), "chapter markers out of reading order")

    def test_body_content_present_and_ordered(self):
        a = self.text.index("Alpha covers systems")
        b = self.text.index("Beta covers feedback loops")
        g = self.text.index("Gamma covers stocks and flows")
        self.assertLess(a, b)
        self.assertLess(b, g)

    def test_cover_extracted(self):
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "cover.png")))
        self.assertIn("COVER: cover.png", self.text)

    def test_cover_followed_through_xhtml_wrapper(self):
        tmp = tempfile.mkdtemp()
        epub = make_fixture_epub.build_wrapper_cover(os.path.join(tmp, "w.epub"))
        out = os.path.join(tmp, "book.txt")
        subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "epub_to_text.py"), epub, out],
            check=True, capture_output=True, text=True,
        )
        with open(out, encoding="utf-8") as fh:
            text = fh.read()
        # the real image, not the .xhtml wrapper
        self.assertIn("COVER: cover.png", text)
        self.assertTrue(os.path.exists(os.path.join(tmp, "cover.png")))
        self.assertFalse(os.path.exists(os.path.join(tmp, "cover.xhtml")))


if __name__ == "__main__":
    unittest.main()
