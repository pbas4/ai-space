#!/usr/bin/env python3
"""split.py: marker-based split, window fallback, --only, index.json."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SPLIT = os.path.join(HERE, "..", "skills", "book-summary", "scripts", "split.py")


def run(src_text, *extra):
    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, "book.txt")
    out = os.path.join(tmp, "chunks")
    with open(src, "w", encoding="utf-8") as fh:
        fh.write(src_text)
    subprocess.run([sys.executable, SPLIT, src, out, *extra], check=True,
                   capture_output=True, text=True)
    with open(os.path.join(out, "index.json"), encoding="utf-8") as fh:
        return out, json.load(fh)


class Split(unittest.TestCase):
    def test_splits_on_chapter_markers(self):
        text = "\n\n".join(
            "## CHAPTER: Chapter %d\n\n%s" % (i, ("word " * 200)) for i in range(1, 5)
        )
        _, idx = run(text)
        self.assertEqual([e["title"] for e in idx],
                         ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4"])

    def test_only_range(self):
        text = "\n\n".join(
            "## CHAPTER: Chapter %d\n\n%s" % (i, ("word " * 200)) for i in range(1, 6)
        )
        out, idx = run(text, "--only", "2-3")
        self.assertEqual([e["n"] for e in idx], [2, 3])
        self.assertEqual(sorted(os.listdir(out)),
                         sorted(["index.json"] + [e["file"] for e in idx]))

    def test_window_fallback_without_structure(self):
        text = ("para of some words here. " * 50 + "\n\n") * 40  # ~10k words, no headings
        _, idx = run(text, "--max-words", "2000")
        self.assertGreaterEqual(len(idx), 4)
        self.assertTrue(all(e["words"] <= 2000 * 1.6 for e in idx))


if __name__ == "__main__":
    unittest.main()
