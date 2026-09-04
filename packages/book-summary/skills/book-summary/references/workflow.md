# Summarizing workflow

How to turn the collected notes into the filled template. Read by the
`book-synthesizer` agent and by anyone running the skill by hand. The goal is a
summary that is genuinely useful six months later — specific, honest about weak
spots, structured identically to every other summary in the collection.

## Language

Write the summary in the same language as the source, unless the user asks for a
specific language. Keep quotes in the original language; add a short gloss in
brackets only if the user's working language differs.

## Inputs you're working from

- `notes.md` — per-chunk notes in reading order (from `book-chunk-summarizer`).
  For `quick` depth you get `book.txt` directly instead.
- `meta.json` — Open Library metadata, or `{}` on a miss. Seeds frontmatter and
  topic tags (`subjects`).
- `highlights.md` — the reader's own highlighted passages, if any (see below).
- `related.md` — real vault notes to link in *How this connects*, if any.

## Depth

| Depth | Chunk fan-out | Sections produced | Rough length |
|---|---|---|---|
| `quick` | none — synthesize straight from `book.txt` | frontmatter, `# Title`, *In one paragraph*, *Key ideas* (5–8), *Actionable takeaways*. Delete the rest. | 350–500 words |
| `standard` | yes | the full template, lengths in the table below | 900–1500 words |
| `deep` | yes, finer (`split.py --max-words 5000`) | full template; *Chapter-by-chapter* up to ~250 words per chapter; append a `## Teaching outline` (nested bullets someone could teach from) before the closing `---` | 2000–3500 words |

## Section targets (`standard`)

| Section | Target length | Notes |
|---|---|---|
| In one paragraph | 4–6 sentences | The thesis and the intended reader. State it plainly. |
| Why read this book | 2–4 bullets | The concrete payoff. If the book doesn't earn it, say so in Critiques instead. |
| Key ideas | 5–10 bullets | Each a *claim* ("Habits form via a cue-routine-reward loop"), not a topic ("Habits"). |
| Chapter-by-chapter | 80–200 words per chapter | `### N. Title`, using titles from `chunks/index.json` / the notes. Follow source order. For an article or a document with no chapters, retitle this **Section-by-section** and follow its own headings. |
| Notable quotes | 5–15 quotes | Blockquote each, attribute with chapter/section, keep under ~40 words each. |
| Actionable takeaways | 3–8 items | Instructions the reader can act on this week. |
| Critiques & open questions | 2–5 bullets | Weak evidence, dated claims, overreach, unanswered questions. Always write something. |
| How this connects | 2–5 bullets | See below. |

## Reader highlights (`highlights.md` non-empty)

- In *Notable quotes*, prefer passages the reader highlighted and append
  ` — reader-highlighted` to those lines.
- Let the highlights steer emphasis in *Key ideas* and *Actionable takeaways*
  toward what the reader cared about — without dropping a central idea they
  happened not to mark. The summary should still stand on its own.

## How this connects

- If `related.md` was provided, fill this section **only** with the `[[links]]` it
  lists — those notes exist in the vault. Never invent a wikilink; an unresolved
  `[[link]]` is a dead end.
- If not, use 2–5 bullets naming related books/ideas in plain prose.

## Frontmatter and tags

Fill every field. `source_format` is one of `epub`/`pdf`/`docx`/`html`/`txt`/`url`;
`source_file` is the original filename or URL; `date_summarized` is today's date
(ISO). Leave `rating` blank — the user's to set.

**Topic tags.** Add 1–3 `book/<topic>` tags to `tags` and mirror them in `topics:`.
Controlled vocabulary so the vault stays queryable — pick from: `finance`,
`economics`, `business`, `productivity`, `psychology`, `philosophy`, `science`,
`technology`, `history`, `biography`, `politics`, `health`, `writing`, `design`,
`management`, `self-help`, `fiction`. Add a new one only if none fit. Seed from
Open Library `subjects`. `{{TOPIC_TAGS}}` expands to `, book/finance,
book/psychology` (leading comma included); `{{TOPICS}}` to `finance, psychology`.

## Cover image

- EPUB: `epub_to_text.py` already wrote `cover.<ext>` next to `book.txt`. Copy it
  to `<stem>.<ext>` beside the summary `.md`, set `cover:` frontmatter, and
  uncomment the `![[...]]` embed line.
- Other formats: if `meta.json` has a `cover_url`, ask the user before downloading,
  then `scripts/fetch_cover.sh "<url>" "<dir>/<stem>"`.
- No cover: delete the `cover:` line and the embed line.

## Quoting limits

Total quoted material stays well under a page — a dozen short excerpts at most.
Never include long passages, and never reconstruct a section from stitched quotes.

## Filename

`<Author> - <Title>.md`, author as printed (first name first). Strip
`/ \ : * ? " < > |` and newlines; collapse runs of spaces. The PDF and cover take
the same stem. For a document with no clear author, use the site or publication
name, else just the title.

## Scanned PDFs

If `extract.sh` warned almost no text came out, offer: `ocrmypdf input.pdf ocr.pdf`
then rerun; proceed with the sparse text (note the gap in Critiques); or supply a
different file.
