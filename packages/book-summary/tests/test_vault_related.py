#!/usr/bin/env python3
"""vault_index.py + vault_related.py: frontmatter parse, overlap ranking, exclusion."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "skills", "book-summary", "scripts")
IDX = os.path.join(SCRIPTS, "vault_index.py")
REL = os.path.join(SCRIPTS, "vault_related.py")

NOTES = {
    "James Clear - Atomic Habits.md":
        "---\ntitle: Atomic Habits\ntags: [book, book/psychology, habits]\n---\nbody",
    "Charles Duhigg - The Power of Habit.md":
        "---\ntitle: The Power of Habit\ntopics: [psychology, habits]\n---\nbody",
    "Donella Meadows - Thinking in Systems.md":
        "---\ntitle: Thinking in Systems\ntags: [book/systems, science]\n---\nbody",
    "Grocery list.md":
        "---\ntags: [chore]\n---\nmilk, eggs",
}


class VaultRelated(unittest.TestCase):
    def setUp(self):
        self.vault = tempfile.mkdtemp()
        for name, text in NOTES.items():
            with open(os.path.join(self.vault, name), "w", encoding="utf-8") as fh:
                fh.write(text)
        r = subprocess.run([sys.executable, IDX, self.vault], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.index = os.path.join(self.vault, ".book-summary-index.json")

    def test_index_strips_book_prefix_and_merges(self):
        with open(self.index, encoding="utf-8") as fh:
            rows = {row["basename"]: set(row["tags"]) for row in json.load(fh)}
        self.assertIn("psychology", rows["James Clear - Atomic Habits"])   # from book/psychology
        self.assertIn("habits", rows["Charles Duhigg - The Power of Habit"])  # from topics

    def test_related_ranks_by_overlap_and_excludes_self(self):
        r = subprocess.run(
            [sys.executable, REL, "--index", self.index,
             "--topics", "psychology,habits", "--title", "Atomic Habits",
             "--exclude", "James Clear - Atomic Habits"],
            capture_output=True, text=True,
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        lines = [ln for ln in r.stdout.splitlines() if ln.strip()]
        self.assertEqual(lines[0], "- [[Charles Duhigg - The Power of Habit]]")
        self.assertNotIn("- [[James Clear - Atomic Habits]]", lines)  # excluded
        self.assertNotIn("- [[Grocery list]]", lines)                # no overlap

    def test_no_match_prints_nothing(self):
        r = subprocess.run(
            [sys.executable, REL, "--index", self.index,
             "--topics", "cooking", "--title", "Zzz"],
            capture_output=True, text=True,
        )
        self.assertEqual(r.returncode, 0)
        self.assertEqual(r.stdout.strip(), "")


if __name__ == "__main__":
    unittest.main()
