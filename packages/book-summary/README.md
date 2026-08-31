# book-summary

Turn an EPUB or PDF book into a structured summary in **Markdown + PDF**, then file
both copies in a Google Drive folder and (optionally) an Obsidian vault.

The skill lives at [`skills/book-summary/`](skills/book-summary/). Everything the
model needs is in `SKILL.md`; the summarizing method is in
`references/workflow.md`; the fixed section template and PDF stylesheet are in
`assets/`.

## Install (Claude Code)

Symlink the skill into your personal skills directory so Claude discovers it:

```bash
ln -s "$PWD/packages/book-summary/skills/book-summary" \
      "$HOME/.claude/skills/book-summary"
```

Or install the whole package as a plugin via `.claude-plugin/plugin.json`.

## One-time setup

1. **Tools:**

   ```bash
   brew install poppler pandoc typst
   ```

   `poppler` gives `pdftotext`; `pandoc` + `typst` render the PDF (`typst` is a
   single static binary — `weasyprint` or `wkhtmltopdf` also work if present).
   EPUB parsing uses only the Python standard library. `ocrmypdf` is optional, for
   scanned PDFs. Run `skills/book-summary/scripts/check_deps.sh` to verify.

2. **Config** — machine-local, never committed. Copy the example and edit:

   ```bash
   mkdir -p ~/.config/book-summary
   cp packages/book-summary/config.example.json ~/.config/book-summary/config.json
   ```

   | key | meaning |
   |---|---|
   | `gdrive_dir` | Local path of the Google Drive for Desktop folder for summaries. Required. |
   | `obsidian_vault` | Vault root. Leave `""` to skip vault delivery. |
   | `obsidian_books_subdir` | Where `.md` summaries go inside the vault. Default `Books`. |
   | `obsidian_attachments_subdir` | Where the `.pdf` / cover go. Default `Books/attachments`. |
   | `moc_file` | Map-of-Content note; gets a sorted, dedup'd `- [[Author - Title]]` list. |

   Override the config path with `BOOK_SUMMARY_CONFIG=/path/to/config.json`.

## Usage

Point Claude at a book file:

> Summarize `~/Downloads/atomic-habits.epub` and file it.

The skill then: checks deps → extracts text (TOC chapter markers, cover) →
looks up metadata on Open Library → splits into chunks → summarizes per the
workflow (per-chunk notes → synthesis) → fills the template → verifies every
quote against the source → renders the PDF → runs `distribute.sh` → reports
paths.

**Depth.** Ask for `brief`, `standard` (default), or `deep` — e.g. "summarize
this book, deep". Same sections either way; only the amount under each heading
changes, and `deep` adds `Worked examples` + `Apply it`. Recorded in the
`depth:` frontmatter field.

**Practice-forward books.** For how-to / self-improvement / business /
productivity / health titles the *Actionable takeaways* section is expanded into
grouped themes plus a checklist and an anti-patterns list, and
`practice_forward: true` is set in frontmatter.

## Scripts (runnable standalone)

| script | does |
|---|---|
| `scripts/check_deps.sh` | Verify `pdftotext`, `pandoc`, a PDF engine, `python3`. |
| `scripts/extract.sh <in> <out.txt>` | EPUB/PDF → plain text (+ `cover.<ext>`, `## CHAPTER:` markers for EPUB). |
| `scripts/fetch_meta.py --isbn N` / `--title T --author A` | Open Library lookup → JSON (no key). |
| `scripts/split.py <book.txt> <dir>` | Split into ordered chunks + `index.json`. `--only 1-3,7`, `--max-words N`. |
| `scripts/fetch_cover.sh <url> <stem>` | Download a cover (network; confirm with user first). |
| `scripts/check_existing.sh "<Author> - <Title>"` | Report whether a summary already exists in Drive/vault. |
| `scripts/verify_quotes.py <summary.md> <book.txt>` | Check every blockquote appears in the source; exits non-zero on a miss. Offline. |
| `scripts/render_pdf.sh <in.md> <out.pdf>` | Markdown → house-style PDF (typst → weasyprint → wkhtmltopdf). |
| `scripts/distribute.sh <in.md> <in.pdf>` | Copy to Drive + vault, update MOC. Idempotent. |

## Tests

```bash
cd packages/book-summary && npm test        # or: bash tests/run.sh
```

Standard-library Python `unittest` + a shell test — no third-party deps. Covers
EPUB extraction (spine order, TOC markers, metadata, cover), `split.py`
(marker/window/`--only`), `verify_quotes.py` (verbatim pass, reworded fail,
elision bridging), and `distribute.sh` (Drive + vault copy, cover, sorted
idempotent MOC).
