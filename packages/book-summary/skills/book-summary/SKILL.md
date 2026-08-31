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

1. **Tools.** Run `scripts/check_deps.sh`. If anything is missing, show the user
   the install command it prints (`brew install poppler pandoc weasyprint`) and
   stop until it passes.
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

- EPUB → bundled stdlib parser, spine (reading) order preserved; also prints any
  title/author/date metadata it finds.
- PDF → `pdftotext -layout`. If the script warns that very little text came out,
  the PDF is scanned/image-only: tell the user it needs OCR first
  (`ocrmypdf in.pdf out.pdf`) and stop unless they want a partial summary anyway.

Then establish the bibliographic basics — **title, author, publication year, ISBN**
— from the metadata, the first pages, or by asking the user. These anchor the
filename and frontmatter, so confirm them before continuing.

### 3. Read and summarize

Read `references/workflow.md` now. It has the chunking strategy for long books,
the synthesis pass, per-section length targets, and quoting limits. Follow it.

Short version: split by chapter (headings in the extracted text) or ~10k-word
windows if there are no headings; summarize each chunk; then do one synthesis pass
across the chunk summaries to write the final sections.

### 4. Fill the template

Start from `assets/summary-template.md`. Replace every `{{PLACEHOLDER}}`, keep
every heading in order, and delete any leftover template comments.

Filename: `<Author> - <Title>.md`, sanitized (strip `/`, `:`, newlines; collapse
spaces), e.g. `James Clear - Atomic Habits.md`. Write it into `<workdir>/`.

### 5. Render the PDF

```
scripts/render_pdf.sh "<workdir>/<Author> - <Title>.md" "<workdir>/<Author> - <Title>.pdf"
```

Uses pandoc + weasyprint with `assets/pdf-style.css` so every summary PDF looks
identical.

### 6. Distribute

```
scripts/distribute.sh "<workdir>/<Author> - <Title>.md" "<workdir>/<Author> - <Title>.pdf"
```

- Copies both files to `gdrive_dir`.
- If `obsidian_vault` is set: copies the `.md` into `<vault>/<books_subdir>/`, the
  `.pdf` into `<vault>/<attachments_subdir>/`, and appends `- [[<Author> - <Title>]]`
  to the MOC file.
- Idempotent: re-running overwrites the files and won't duplicate the MOC line.

### 7. Report

Give the user the absolute path of every file written, and a 2–3 sentence taste of
the summary so they know it landed well.

## Notes

- Never hand-edit the PDF; if the summary changes, rerun step 5.
- Machine paths belong in the config file, not this skill — keep the package
  portable and safe to commit.
- If `weasyprint` proves painful to install on a given machine, an acceptable
  fallback is `pandoc ... --pdf-engine=wkhtmltopdf`; keep the same CSS.
