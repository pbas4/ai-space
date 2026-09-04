# book-summary

Turn a book or long document into a structured summary in **Markdown + PDF**, then
file both copies in a Google Drive folder and (optionally) an Obsidian vault.

Inputs: `.epub`, `.pdf`, `.docx`, `.html`, `.txt`, `.md`, or an `http(s)://` URL
(best-effort readable text; no JavaScript rendering).

The skill lives at [`skills/book-summary/`](skills/book-summary/). `SKILL.md` is the
orchestration; the summarizing method is in `references/workflow.md`; the fixed
section template and PDF stylesheet are in `assets/`. Two bundled subagents in
[`agents/`](agents/) do the heavy lifting.

## Model-split subagents

`SKILL.md` orchestrates and delegates the two token- or reasoning-heavy parts to
purpose-built subagents, each pinned to the right model:

| Agent | Model | Job |
|---|---|---|
| `book-chunk-summarizer` | Sonnet | One Task per chunk, in parallel — terse notes for its slice. Cheap, high volume. |
| `book-synthesizer` | Opus | One Task — turns all the notes into the finished templated Markdown. Reasoning-heavy, low volume. |

The main session only ever sees the compact notes and the finished draft, so its
context stays clean and the expensive per-chunk pass runs on the cheaper model.

## Install (Claude Code)

Install the whole package as a plugin (from the repo marketplace):

```text
/plugin marketplace add pbas4/ai-space
/plugin install book-summary@ai-space
```

Or, for live development, symlink just the skill:

```bash
ln -s "$PWD/packages/book-summary/skills/book-summary" \
      "$HOME/.claude/skills/book-summary"
```

(The plugin route also ships the subagents; a bare skill symlink does not.)

## One-time setup

1. **Tools:**

   ```bash
   brew install poppler pandoc typst
   ```

   `poppler` gives `pdftotext`; `pandoc` handles DOCX/HTML/URL and drives the PDF
   via `typst` (a single static binary — `weasyprint` / `wkhtmltopdf` also work).
   EPUB parsing and all helper scripts use only the Python standard library.
   `curl` (ships with macOS) is used for URL input; `ocrmypdf` is optional, for
   scanned PDFs. Run `skills/book-summary/scripts/check_deps.sh` to verify.

2. **Config** — machine-local, never committed:

   ```bash
   mkdir -p ~/.config/book-summary
   cp packages/book-summary/config.example.json ~/.config/book-summary/config.json
   ```

   | key | meaning |
   |---|---|
   | `gdrive_dir` | Google Drive for Desktop folder for summaries. Required. |
   | `obsidian_vault` | Vault root. `""` skips vault delivery **and** real backlinks. |
   | `obsidian_books_subdir` / `obsidian_attachments_subdir` | Where `.md` / `.pdf` + cover land. Defaults `Books` / `Books/attachments`. |
   | `moc_file` | Map-of-Content note; gets a sorted, dedup'd `- [[Author - Title]]` list. |
   | `default_depth` | `quick` / `standard` / `deep` to skip the prompt; `""` (default) makes the skill ask each run. |
   | `kindle_clippings` | Path to a Kindle `My Clippings.txt`, so highlights are folded in automatically. `""` to disable. |

   Override the config path with `BOOK_SUMMARY_CONFIG=/path/to/config.json`.

## Usage

> Summarize `~/Downloads/atomic-habits.epub` and file it.
> Give me a **quick** summary of this article: https://example.com/essay
> Do a **deep** summary of `report.pdf` and pull in my Kindle highlights.

Flow: check deps → extract → Open Library metadata → (optional) reader highlights →
split → fan out `book-chunk-summarizer` Tasks → (optional) vault backlinks →
`book-synthesizer` Task → render PDF → `distribute.sh` → report paths.

### Depth

| Depth | What you get |
|---|---|
| `quick` | One pass, no fan-out. In-one-paragraph + Key ideas + Takeaways. ~350–500 words. Default for short inputs / URLs. |
| `standard` | The full template. Key ideas 5–10, quotes 5–15, 80–200-word chapter treatments. ~900–1600 words. |
| `deep` | An analytical study: finer chunking, 15–25 load-bearing Key ideas and 25–40 Notable quotes (both themed), 200–400-word chapter treatments, 6–12 critique points, plus deep-only **Contexto y contraargumento** (steelman + rebuttal), **Glosario**, and **Teaching outline** sections. Typically 5000–9000 words. |

The three depths are meant to read as clearly different documents, not the same
summary at three lengths. If a run doesn't match, that's a synthesizer prompt
issue — check `references/workflow.md` § Depth / Section targets.

### Reader highlights (feature #2)

Pass a Kindle `My Clippings.txt`, a Readwise markdown export, or a Readwise CSV
(or set `kindle_clippings`). Matching highlights for the book are folded into
*Notable quotes* (marked `— reader-highlighted`) and bias the emphasis of *Key
ideas* / *Actionable takeaways*.

### Real vault links (feature #6)

When `obsidian_vault` is set, `vault_index.py` + `vault_related.py` find existing
notes that share topics/title words, and *How this connects* is filled **only**
with links that resolve — no invented `[[wikilinks]]`.

## Scripts (runnable standalone)

| script | does |
|---|---|
| `scripts/check_deps.sh` | Verify `pdftotext`, `pandoc`, a PDF engine, `python3` (+ optional `curl`, `ocrmypdf`). |
| `scripts/extract.sh <in> <out.txt>` | epub / pdf / docx / html / txt / md / URL → plain text (+ `cover.<ext>`, `## CHAPTER:` markers for EPUB). |
| `scripts/fetch_meta.py --isbn N` / `--title T --author A` | Open Library lookup → JSON (no key). |
| `scripts/highlights.py --kindle F / --readwise-md F / --readwise-csv F --title T` | Reader highlights for one book → `highlights.md`. |
| `scripts/split.py <book.txt> <dir>` | Split into ordered chunks + `index.json`. `--only 1-3,7`, `--max-words N`. |
| `scripts/vault_index.py <vault>` | Index vault notes → `<vault>/.book-summary-index.json`. |
| `scripts/vault_related.py --index J --topics a,b --title T` | Rank related notes → `- [[link]]` lines that resolve. |
| `scripts/fetch_cover.sh <url> <stem>` | Download a cover (network; confirm with user first). |
| `scripts/check_existing.sh "<Author> - <Title>"` | Report whether a summary already exists in Drive/vault. |
| `scripts/render_pdf.sh <in.md> <out.pdf>` | Markdown → house-style PDF (typst → weasyprint → wkhtmltopdf). |
| `scripts/distribute.sh <in.md> <in.pdf>` | Copy to Drive + vault, update MOC. Idempotent. |

## Tests

```bash
cd packages/book-summary && npm test        # or: bash tests/run.sh
```

Standard-library Python `unittest` + shell tests — no third-party deps. Covers EPUB
extraction (spine order, TOC markers, metadata, cover), `split.py`, `distribute.sh`
(Drive + vault copy, cover, sorted idempotent MOC), `highlights.py` (Kindle +
Readwise parsing, filtering, dedupe), `vault_index`/`vault_related` (overlap
ranking, self-exclusion), and `extract.sh` (txt/md/html dispatch).
