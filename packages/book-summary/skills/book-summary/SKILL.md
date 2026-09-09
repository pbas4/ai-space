---
name: book-summary
description: >-
  Use whenever the user wants a book or long document turned into written notes —
  they point at an .epub / .pdf / .docx / .html / .txt / .md file or a URL, paste a
  path, say "summarize this book", "make me a summary of <book>", "give me book
  notes / a book breakdown", or "add this book to my second brain / Obsidian /
  knowledge vault". Produces a structured summary in BOTH Markdown and PDF from a
  fixed template, then files both copies in the configured Google Drive folder and
  (optionally) an Obsidian vault. Trigger even if the user mentions only one side —
  just the summary ("break down Atomic Habits for me"), or just the delivery ("push
  my book notes to Drive").
---

# Book Summary

Turn a book or long document into a consistent, structured summary in two formats
(Markdown + PDF) and file it where the user keeps their reading notes.

The Markdown file is the source of truth. The PDF is always regenerated from it,
so the two never drift. The template's fixed section list is load-bearing: it lets
the user compare any two books at a glance and lets Obsidian queries work across
the whole collection. Keep every section, in order, even when one ends up short.

## How the work is split

This skill **orchestrates**; two bundled subagents do the heavy lifting so the
main session's context stays clean and each part runs on the right model:

- **`book-chunk-summarizer`** (model: Sonnet) — one Task per chunk, in parallel,
  each returning terse notes for its slice. Cheap; high volume.
- **`book-synthesizer`** (model: Opus) — one Task that turns all the notes into
  the finished templated Markdown. Reasoning-heavy; low volume.

Run the fan-out and synthesis through the Task tool with those `subagent_type`s.
Everything else (extraction, metadata, rendering, distribution) is scripts you run
directly.

**Depth.** The user may ask for `quick`, `standard` (default), or `deep`. `deep`
is meant to read as an analytical study, not a longer summary — see step 1 and
`workflow.md`.

**Practice-forward books.** For how-to / self-improvement / business /
productivity / health / management titles, *Actionable takeaways* is expanded
into grouped themes with a checklist and anti-patterns, and
`practice_forward: true` is set in frontmatter. See `workflow.md` § Practice-forward books.

## Prerequisites

1. **Tools.** Run `scripts/check_deps.sh`. If anything required is missing, show
   the user the install command it prints (`brew install poppler pandoc typst`)
   and stop until it passes.
2. **Config.** Machine-local settings live at `~/.config/book-summary/config.json`
   (override with `$BOOK_SUMMARY_CONFIG`), never in this repo. If it's absent, copy
   `../../config.example.json` there and ask the user to fill `gdrive_dir`.
   Optional keys: `obsidian_vault` (enables vault delivery + real backlinks),
   `default_depth` (`quick`/`standard`/`deep`), `kindle_clippings` (path to a
   Kindle `My Clippings.txt`).

## Procedure

Work in a scratch directory (e.g. `mktemp -d`). Do these steps in order.

### 1. Identify source and depth

- Get the input (ask if not provided): a local `.epub/.pdf/.docx/.html/.txt/.md`
  file, or an `http(s)://` URL. Record the kind for `source_format`
  (`epub/pdf/docx/html/txt/url`).
- Settle on **depth** in this order:
  1. If the user named one in their request (quick / standard / deep), use it.
  2. Else if `default_depth` in config is a non-empty value, use it silently.
  3. Else **ask the user** — present the three options and what each produces
     (table below). Do not silently default. For a short input (< ~5k words,
     e.g. an article or URL) recommend `quick` in that prompt.

  | depth | produces |
  |---|---|
  | `quick` | one synthesis pass, no chunk fan-out; ~350–500 words (In one paragraph + Key ideas + Takeaways) |
  | `standard` | the full template; ~900–1600 words |
  | `deep` | an analytical study: finer chunking, 15–25 load-bearing Key ideas and 25–40 Notable quotes (both themed), 200–400-word chapter treatments, 6–12 critique points, plus deep-only *Contexto y contraargumento*, *Glosario*, and *Teaching outline* sections; typically 5000–9000 words |

### 2. Extract the text

```
scripts/extract.sh <input> <workdir>/book.txt
```

EPUB uses the bundled stdlib parser (spine order, `## CHAPTER:` markers from the
real TOC, `cover.<ext>` written next to `book.txt`). PDF uses `pdftotext -layout`;
DOCX/HTML/URL go through pandoc. If the script warns almost no text came out, tell
the user why (scanned PDF → OCR; JS-rendered page → save as a file) and stop unless
they want a partial summary.

### 3. Metadata

```
scripts/fetch_meta.py --isbn <isbn>            # or: --title "<t>" --author "<a>"
```

Save the JSON to `<workdir>/meta.json`. Confirm shaky fields with the user. For a
non-book document, fill what you can and leave the rest blank. This is also what
tells you whether the book is practice-forward (`workflow.md` § Practice-forward
books) — it feeds the topic tags that decide it.

### 4. Reader highlights (optional — feature depends on the user having them)

If the user passed a Kindle `My Clippings.txt` / Readwise export, or
`kindle_clippings` is set in config:

```
scripts/highlights.py --kindle <clippings.txt> --title "<title>" --author "<a>" \
  --out <workdir>/highlights.md
```

(`--readwise-md` / `--readwise-csv` also accepted.) If it finds nothing for this
title, skip — don't force it.

### 5. Segment (skip for `quick`)

```
scripts/split.py <workdir>/book.txt <workdir>/chunks/          # --max-words 5000 for deep
```

Read `<workdir>/chunks/index.json` to see the shape.

### 6. Fan out chunk notes (skip for `quick`)

For each chunk (or a small batch of adjacent chunks), spawn a
`book-chunk-summarizer` Task **in parallel**. Give each: the chunk file path(s),
the title(s) from `index.json`, the book title/author, and the depth. Concatenate
every agent's returned notes, in chunk order, into `<workdir>/notes.md`.

### 7. Vault backlinks (only if `obsidian_vault` is set)

```
scripts/vault_index.py "<obsidian_vault>"
scripts/vault_related.py --index "<obsidian_vault>/.book-summary-index.json" \
  --topics "<comma,topics>" --title "<title>" --exclude "<Author> - <Title>" \
  > <workdir>/related.md
```

Topics come from your read of the book + `meta.json` `subjects`. If `related.md`
is empty, that's fine.

### 8. Synthesize

Spawn **one** `book-synthesizer` Task. Give it the paths to: `assets/summary-template.md`,
`references/workflow.md`, `<workdir>/notes.md` (or `<workdir>/book.txt` for
`quick`), `meta.json`, `highlights.md` and `related.md` if they exist; plus the
output path `<workdir>/<Author> - <Title>.md`, the `source_format`, `source_file`,
today's date, and the depth. It writes the filled Markdown and returns the path.

Filename: `<Author> - <Title>.md`, sanitized (strip `/ \ : * ? " < > |` and
newlines; collapse spaces). Before the agent writes, run
`scripts/check_existing.sh "<Author> - <Title>"`; if it reports a match, ask the
user before overwriting.

### 9. Verify the quotes

```
scripts/verify_quotes.py "<workdir>/<Author> - <Title>.md" "<workdir>/book.txt"
```

Every `> ...` blockquote must appear verbatim in `book.txt` (offline, no
network). For any `FAIL`, fix the wording, drop the quote, or demote it to a
plain paraphrase, then re-run until it exits 0 — see `workflow.md` § Quote
verification. Don't skip this: it's the guard against a hallucinated quote.

### 10. Render the PDF

```
scripts/render_pdf.sh "<workdir>/<Author> - <Title>.md" "<workdir>/<Author> - <Title>.pdf"
```

### 11. Distribute

```
scripts/distribute.sh "<workdir>/<Author> - <Title>.md" "<workdir>/<Author> - <Title>.pdf"
```

Copies `.md`, `.pdf`, and cover to `gdrive_dir`; if `obsidian_vault` is set, also
into the vault (`.md` in books subdir, `.pdf`/cover in attachments) and inserts a
sorted, deduped `- [[<Author> - <Title>]]` line in the MOC. Idempotent.

### 12. Report

Give the user the absolute path of every file written, and a 2–3 sentence taste of
the summary.

## Notes

- Never hand-edit the PDF; if the summary changes, rerun step 10.
- Machine paths belong in the config file, not this skill — keep the package
  portable and safe to commit.
- `fetch_meta.py`, `fetch_cover.sh`, and URL extraction reach the network
  (Open Library, the cover host, the given URL). Metadata lookup sends only an
  ISBN or title/author. Confirm with the user before downloading a cover. Every
  other script — including `verify_quotes.py` — is offline.
- `verify_quotes.py` gates on quotes only; it can't judge whether the prose is
  faithful. The per-chunk notes file (step 6 / `workflow.md` § Inputs) is what
  keeps the body honest — the chunk agents write it from the source, not from
  the synthesizer's memory of the book.
