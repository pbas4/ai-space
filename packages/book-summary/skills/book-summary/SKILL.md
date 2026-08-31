---
name: book-summary
description: >-
  Use whenever the user wants a book turned into written notes — they point at an
  .epub or .pdf book file, paste a book's path, say "summarize this book", "make me
  a summary of <book>", "give me book notes / a book breakdown", or "add this book
  to my second brain / Obsidian / knowledge vault". Produces a structured summary in
  BOTH Markdown and PDF from a fixed template, then files both copies in the
  configured Google Drive folder and (optionally) an Obsidian vault. Trigger even if
  the user mentions only one side — just the summary ("break down Atomic Habits for
  me"), or just the delivery ("push my book notes to Drive").
---

# Book Summary

Turn an EPUB or PDF book into a consistent, structured summary in two formats
(Markdown + PDF) and file it where the user keeps their reading notes.

The Markdown file is the source of truth. The PDF is always regenerated from it,
so the two never drift. The template's fixed section list is load-bearing: it lets
the user compare any two books at a glance and lets Obsidian queries work across
the whole collection. Keep every section, in order, even when one ends up short.

## Prerequisites

1. **Tools.** Run `scripts/check_deps.sh`. If anything required is missing, show
   the user the install command it prints (`brew install poppler pandoc typst`)
   and stop until it passes.
2. **Config.** Machine-local settings live at `~/.config/book-summary/config.json`
   (override with `$BOOK_SUMMARY_CONFIG`), never in this repo. If it's absent, copy
   `../../config.example.json` there and ask the user to fill `gdrive_dir`. Setting
   `obsidian_vault` is optional and enables vault delivery.

## Procedure

Work in a scratch directory (e.g. `mktemp -d`). Do these steps in order.

### 1. Identify the source

Get the input file path (ask if not provided). Supported extensions: `.epub`,
`.pdf`. Record which one — it goes in the summary's frontmatter.

### 2. Extract the text

```
scripts/extract.sh <input-file> <workdir>/book.txt
```

- EPUB → bundled stdlib parser. It follows the spine for reading order, uses the
  book's own table of contents to insert `## CHAPTER: <title>` markers, extracts
  the embedded `cover.<ext>` next to `book.txt`, and prints any DC metadata.
- PDF → `pdftotext -layout`. If the script warns that very little text came out,
  the PDF is scanned: tell the user it needs OCR (`ocrmypdf in.pdf out.pdf`) and
  stop unless they want a partial summary.

### 3. Read `references/workflow.md` and follow it

It covers, in order: resolving bibliographic metadata with
`scripts/fetch_meta.py` (Open Library, no key), segmenting the text with
`scripts/split.py chunks/` and reading chunks one at a time, the per-chunk and
synthesis passes with section length targets, topic-tag taxonomy, cover handling,
quoting limits, and the filename rule. Don't skip it — the quality of the summary
depends on that method.

### 4. Fill the template

Start from `assets/summary-template.md`. Replace every `{{PLACEHOLDER}}`, keep
every heading in order, delete leftover template comments and any optional lines
that don't apply (e.g. the cover embed).

Filename: `<Author> - <Title>.md`, sanitized. First run
`scripts/check_existing.sh "<Author> - <Title>"` and, if it reports a match, ask
the user before overwriting. Write the `.md` (and the copied `cover.<ext>` as
`<stem>.<ext>`) into `<workdir>/`.

### 5. Render the PDF

```
scripts/render_pdf.sh "<workdir>/<Author> - <Title>.md" "<workdir>/<Author> - <Title>.pdf"
```

Uses pandoc with the first available engine (typst → weasyprint → wkhtmltopdf) so
every summary PDF looks consistent.

### 6. Distribute

```
scripts/distribute.sh "<workdir>/<Author> - <Title>.md" "<workdir>/<Author> - <Title>.pdf"
```

- Copies the `.md`, `.pdf`, and cover (if present) to `gdrive_dir`.
- If `obsidian_vault` is set: copies the `.md` into `<vault>/<books_subdir>/`, the
  `.pdf` and cover into `<vault>/<attachments_subdir>/`, and inserts
  `- [[<Author> - <Title>]]` into the MOC file, kept sorted and duplicate-free.
- Idempotent: re-running overwrites the files and won't duplicate the MOC line.

### 7. Report

Give the user the absolute path of every file written, and a 2–3 sentence taste of
the summary so they know it landed well.

## Notes

- Never hand-edit the PDF; if the summary changes, rerun step 5.
- Machine paths belong in the config file, not this skill — keep the package
  portable and safe to commit.
- `fetch_meta.py` and `fetch_cover.sh` reach the network (Open Library only).
  Metadata lookup sends just an ISBN or title/author. Confirm with the user before
  downloading a cover.
