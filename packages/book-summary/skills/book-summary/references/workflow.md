# Summarizing workflow

Guidance for step 3 of `SKILL.md`: turning extracted `book.txt` into the filled
template. The goal is a summary that is genuinely useful six months later —
specific, honest about weak spots, structured identically to every other summary
in the collection.

## Language

Write the summary in the same language as the book, unless the user asks for a
specific language. Keep quotes in the original language; add a short English gloss
in brackets only if the user's working language differs.

## 1. Resolve the metadata first

Run `scripts/fetch_meta.py`:

- `--isbn <isbn>` if the extraction header or copyright page gave one, else
- `--title "<title>" --author "<surname>"`.

It returns JSON (title, authors, year, publishers, subjects, `cover_url`,
`openlibrary_url`) from Open Library, or `{}` on a miss. Use it to fill
frontmatter and to seed topic tags from `subjects`. Confirm anything shaky with
the user rather than guessing. If it returns `{}`, fall back to the EPUB metadata
header and the first pages of `book.txt`.

## 2. Segment the text

Run `scripts/split.py book.txt chunks/`. It splits on `## CHAPTER:` markers
(added by `epub_to_text.py` from the EPUB's real TOC) when present, otherwise on
heading-like lines, otherwise into ~8,000-word windows. It writes
`chunks/000-*.txt` … and `chunks/index.json` (n, file, title, words).

- Read `chunks/index.json` to see the shape of the book.
- Read the chunk files **one at a time** — do not load `book.txt` whole for a
  long book; that is what the split is for.
- `--only 1-3,7` restricts output to specific chunks if the user asked for just
  certain chapters. `--max-words N` tunes window size.

## 3. Summarize each chunk

For every chunk keep terse working notes (not the final file yet):

- 2–4 sentences of what it argues or covers.
- The single most important claim or turn in the argument.
- Up to 2 quotable lines with their location.

## 4. Synthesis pass

Read all chunk notes together and write the final sections:

| Section | Target length | Notes |
|---|---|---|
| In one paragraph | 4–6 sentences | The thesis and the intended reader. State it plainly. |
| Why read this book | 2–4 bullets | The concrete payoff. If the book does not earn it, say so in Critiques instead. |
| Key ideas | 5–10 bullets | Each a *claim* ("Habits form via a cue-routine-reward loop"), not a topic ("Habits"). |
| Chapter-by-chapter | 80–200 words per chapter | `### N. Title`, using the titles from `index.json`. Follow book order. |
| Notable quotes | 5–15 quotes | Blockquote each, attribute with chapter/section, keep under ~40 words each. |
| Actionable takeaways | 3–8 items | Instructions the reader can act on this week. |
| Critiques & open questions | 2–5 bullets | Weak evidence, dated claims, overreach, unanswered questions. Always write something. |
| How this connects | 2–5 bullets | Related books/ideas as `[[wikilinks]]`; Obsidian resolves them once filed. |

## 5. Frontmatter and tags

Fill every field. `source_format` is `epub`/`pdf`; `source_file` is the original
filename; `date_summarized` is today's date (ISO). Leave `rating` blank — the
user's to set.

**Topic tags.** Add 1–3 `book/<topic>` tags to the `tags` list and mirror them in
`topics:`. Use a small controlled vocabulary so the vault stays queryable — pick
from: `finance`, `economics`, `business`, `productivity`, `psychology`,
`philosophy`, `science`, `technology`, `history`, `biography`, `politics`,
`health`, `writing`, `design`, `management`, `self-help`, `fiction`. Add a new
one only if none fit. Seed the choice from Open Library `subjects`.

`{{TOPIC_TAGS}}` in the template expands to `, book/finance, book/psychology`
(leading comma included); `{{TOPICS}}` to `finance, psychology`.

## 6. Cover image

- EPUB: `epub_to_text.py` already wrote `cover.<ext>` next to `book.txt` when the
  file had one — no network. Copy it to `<stem>.<ext>` beside the summary `.md`
  so `distribute.sh` picks it up, set `cover:` frontmatter to the filename, and
  uncomment the `![[...]]` embed line.
- PDF / no embedded cover: if `fetch_meta.py` returned a `cover_url`, ask the user
  before downloading, then `scripts/fetch_cover.sh "<url>" "<dir>/<stem>"`.
- No cover: delete the `cover:` line and the embed line from the template.

## 7. Quoting limits

Total quoted material across the whole summary stays well under a page — a dozen
short excerpts at most. Never include long passages, and never reconstruct a
section of the book from stitched-together quotes.

## 8. Filename

`<Author> - <Title>.md`, author as printed (first name first). Strip
`/ \ : * ? " < > |` and newlines; collapse runs of spaces.

- `James Clear - Atomic Habits.md`
- `Donella H. Meadows - Thinking in Systems.md`

The PDF and cover take the same stem.

Before writing, run `scripts/check_existing.sh "<Author> - <Title>"`. If it reports
an existing file, ask the user whether to overwrite (a re-run will clobber their
`rating`/`status` edits) or pick a new name.

## 9. Scanned PDFs

If `extract.sh` warns almost no text came out, the PDF is images. Offer:

- `ocrmypdf input.pdf ocr.pdf` then rerun from `ocr.pdf` (`brew install ocrmypdf`).
- Proceed with the sparse text (note the gap in Critiques).
- Supply a different file.
