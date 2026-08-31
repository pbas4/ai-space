#!/usr/bin/env python3
"""verify_quotes.py: verbatim quotes pass, reworded ones fail, elisions bridge."""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VERIFY = os.path.join(HERE, "..", "skills", "book-summary", "scripts",
                      "verify_quotes.py")

BOOK = (
    "El objetivo de la vida no es estar del lado de las masas. "
    "Es el proceso lo que forja la riqueza, no los acontecimientos. "
    "Para ganar millones, debes servir a millones de personas que "
    "van a pagar pequenas cantidades por el producto ofrecido. "
    "Las ideas no son mas que flatulencias neurologicas.\n"
    "\n## CHAPTER: SI CREES QUE PUEDES COSTEARLO, NO PUEDES\n\n"
    "Aqui el texto del capitulo habla de otra cosa distinta por completo.\n"
)


def run(summary_md):
    tmp = tempfile.mkdtemp()
    md = os.path.join(tmp, "s.md")
    book = os.path.join(tmp, "book.txt")
    with open(md, "w", encoding="utf-8") as fh:
        fh.write(summary_md)
    with open(book, "w", encoding="utf-8") as fh:
        fh.write(BOOK)
    return subprocess.run([sys.executable, VERIFY, md, book],
                          capture_output=True, text=True)


class VerifyQuotes(unittest.TestCase):
    def test_verbatim_quote_passes(self):
        r = run("## Notable quotes\n\n"
                "> «Es el proceso lo que forja la riqueza, no los "
                "acontecimientos.» — 2.ª parte\n")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("PASS", r.stdout)

    def test_reworded_quote_fails(self):
        r = run("## Notable quotes\n\n"
                "> «Es el proceso lo que construye la riqueza, y nunca los "
                "eventos.» — cap. 2\n")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("FAIL", r.stdout)

    def test_elision_is_bridged(self):
        r = run("## Notable quotes\n\n"
                "> «Para ganar millones, debes servir a millones de personas "
                "[...] por el producto ofrecido.» — Ley de la Efectacion\n")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("PASS", r.stdout)

    def test_no_quotes_is_ok(self):
        r = run("## Notable quotes\n\nnothing here yet\n")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_heading_only_match_warns_but_passes(self):
        r = run("## Notable quotes\n\n"
                "> «Si crees que puedes costearlo, no puedes.» — cap. 3\n")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("WARN", r.stdout)


if __name__ == "__main__":
    unittest.main()
