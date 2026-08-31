# Summarizing workflow

Guidance for step 3 of `SKILL.md`: turning the extracted `book.txt` into the
filled template. The goal is a summary that is genuinely useful six months later —
specific, honest about weak spots, and structured identically to every other
summary in the collection.

## 1. Segment the text

Prefer the book's own structure:

- Look for chapter headings in `book.txt`. After extraction they usually survive
  as short ALL-CAPS or title-case lines, often preceded by "Chapter N", a number,
  or a part divider. `grep -nE '^(chapter |part |[0-9]+[.)] )' -i book.txt` is a
  quick probe.
- If there are clear chapters, treat each as one chunk.
- If there are none (some non-fiction, most essays), split into ~10,000-word
  windows on paragraph boundaries.

For very long books (> ~150k words) a two-level pass keeps quality up: summarize
each chunk to ~150 words, then group chunk summaries by part and summarize those,
then synthesize.

## 2. Summarize each chunk

For every chunk write, in your working notes (not the final file yet):

- 2–4 sentences of what it argues or covers.
- The single most important claim or turn in the argument.
- Up to 2 quotable lines with their location.

Keep chunk notes terse. They are raw material for the synthesis pass.

## 3. Synthesis pass

Read all chunk notes together and write the final template sections:

| Section | Target length | Notes |
|---|---|---|
| In one paragraph | 4–6 sentences | The thesis and the intended reader. State it plainly. |
| Why read this book | 2–4 bullets | The concrete payoff. Skip if the book does not earn it — say so in Critiques instead. |
| Key ideas | 5–10 bullets | Each a *claim* ("Habits form via a cue-routine-reward loop"), not a topic ("Habits"). |
| Chapter-by-chapter | 80–200 words per chapter | `### N. Title` headings. Follow the book's order. |
| Notable quotes | 5–15 quotes | Blockquote each, attribute with chapter/section, keep under ~40 words each. |
| Actionable takeaways | 3–8 items | Phrased as instructions the reader can act on this week. |
| Critiques & open questions | 2–5 bullets | Weak evidence, dated claims, overreach, unanswered questions. Always write something here. |
| How this connects | 2–5 bullets | Related books/ideas as `[[wikilinks]]`; Obsidian resolves them once the note is in the vault. |

## 4. Frontmatter

Fill every field. `year` and `isbn` come from the extracted metadata header, the
copyright page in the first pages of `book.txt`, or the user. `source_format` is
`epub` or `pdf`. `source_file` is the original filename. Leave `rating` blank —
that's the user's to add. `date_summarized` is today's date, ISO format.

## 5. Quoting limits

Total quoted material across the whole summary stays well under a page — a dozen
short excerpts at most. This is a summary, not a reproduction. Never include long
passages, and never reconstruct a section of the book from stitched-together
quotes.

## 6. Filename

`<Author> - <Title>.md`. Use the author as printed (first name first). Strip
characters that break filesystems or wikilinks: `/ \ : * ? " < > |` and newlines;
collapse runs of spaces. Examples:

- `James Clear - Atomic Habits.md`
- `Donella H. Meadows - Thinking in Systems.md`

The PDF takes the same stem with `.pdf`.

## 7. Scanned PDFs

If `extract.sh` warns that almost no text came out, the PDF is images. Options to
offer the user:

- `ocrmypdf input.pdf ocr.pdf` then rerun from `ocr.pdf` (needs `brew install ocrmypdf`).
- Proceed with whatever sparse text exists (note the gap in Critiques).
- Supply a different file.
