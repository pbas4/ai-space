#!/usr/bin/env python3
"""split.py: marker split + consolidation, window fallback, --only, index.json."""
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


def chapters(n, words_each, start=1):
    return "\n\n".join(
        "## CHAPTER: Chapter %d\n\n%s" % (i, ("word " * words_each))
        for i in range(start, start + n)
    )


class Split(unittest.TestCase):
    def test_small_marker_sections_consolidate(self):
        # 12 sections * 500 words = 6000 words, target 3000 -> ~2 chunks, not 12
        out, idx = run(chapters(12, 500), "--max-words", "3000")
        self.assertLessEqual(len(idx), 4)
        self.assertGreaterEqual(len(idx), 2)
        # a merged chunk records how many sections it absorbed
        self.assertTrue(any("+" in (e["title"] or "") for e in idx))
        # the real section boundaries survive inside the chunk text
        first = open(os.path.join(out, idx[0]["file"]), encoding="utf-8").read()
        self.assertIn("## Chapter 1", first)

    def test_big_chapter_is_windowed(self):
        # one 9000-word section, target 3000 -> multiple parts
        _, idx = run("## CHAPTER: Long\n\n" + ("word " * 9000), "--max-words", "3000")
        self.assertGreaterEqual(len(idx), 3)
        self.assertTrue(all(e["words"] <= 3000 * 1.6 for e in idx))

    def test_only_range_after_consolidation(self):
        out, idx = run(chapters(20, 800), "--max-words", "2000", "--only", "2-3")
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
