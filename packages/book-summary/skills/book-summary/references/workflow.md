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
  For `quick` depth you get `book.txt` directly instead. Compose the final
  sections from this file, not from memory of the book — write the notes down
  as you read each chunk, don't skip straight to synthesis.
- `meta.json` — Open Library metadata, or `{}` on a miss. Seeds frontmatter and
  topic tags (`subjects`) — also what tells you whether a book is
  practice-forward (see below).
- `highlights.md` — the reader's own highlighted passages, if any (see below).
- `related.md` — real vault notes to link in *How this connects*, if any.

## Depth

The three depths are meant to feel **clearly different**, not just longer. `quick`
is a skeleton, `standard` is a solid summary, `deep` is an analytical study.
Record the chosen mode in the `depth:` frontmatter field so the vault stays
queryable.

| Depth | Chunk fan-out | Sections | Rough length |
|---|---|---|---|
| `quick` | none — synthesize straight from `book.txt` | frontmatter, `# Title`, *In one paragraph*, *Key ideas* (5–8), *Actionable takeaways*. Delete the rest. | 350–500 words |
| `standard` | yes | the full template, `standard` column below | 900–1600 words |
| `deep` | yes, finer (`split.py --max-words 5000`) | the full template at the `deep` column below, **plus** three deep-only sections appended before the closing `---`: `## Contexto y contraargumento` (steelman + rebuttal), `## Glosario` (the book's coined terms, one line each), `## Teaching outline` (nested bullets someone could teach from) | 5000–9000 words |

At `deep`, *Key ideas* and *Notable quotes* scale with the book but have **soft
ceilings**: keep *Key ideas* to the **load-bearing claims** (aim 15–25, stop
around 35 even for a very dense book — if you have more, some aren't "key"), and
*Notable quotes* to **25–40** (stop at ~45). A thin book earns far fewer. Length
is an output of doing the analysis, not a target to hit.

## Section targets

| Section | `standard` | `deep` |
|---|---|---|
| In one paragraph | 4–6 sentences: thesis + intended reader | 2–3 paragraphs: thesis, the *structure* of the argument (how the parts build), and who it is / isn't for |
| Why read this book | 2–4 bullets | 3–6 bullets, each naming the concrete transferable tool or reframe |
| Key ideas | 5–10 bullets, each a *claim* not a topic | the load-bearing claims only — aim 15–25, ~35 max; each = the claim + a clause on *why it holds or where it's shaky*; group under `### <theme>` sub-headings when there are more than ~12 |
| Chapter-by-chapter | 80–200 w/section | 200–400 w/section: state the *move* the argument makes here, its evidence, and every named example — not just the topic; prefer the book's real chapters over grouping into parts when there's a manageable number of them |
| Notable quotes | 5–15, attributed, <40 words each | 25–40 (~45 max), attributed, <40 words each, grouped under `### <theme>` sub-headings |
| Actionable takeaways | 3–8 imperative items, or expanded (see *Practice-forward books*) | 6–12 items, each a bolded action + 1–2 sentences of how |
| Critiques & open questions | 2–5 bullets | 6–12 bullets: weak evidence, dated claims, overreach, internal contradictions, unanswered questions — be specific and unsparing |
| How this connects | 2–5 bullets | 4–8 bullets, each drawing the actual distinction, not just naming a title |

**Section / chapter titles** come **verbatim** from the `## CHAPTER:` markers in
`notes.md` / `chunks/index.json` (the book's own table of contents). Do not
invent, shorten, or re-translate them. `### N. <title exactly as extracted>`.
Follow source order. For an article with no chapters, retitle the section
**Section-by-section** and follow the source's own headings.

### `deep`-only sections

- `## Contexto y contraargumento` — first a **steelman** (`### A favor`): the
  strongest good-faith case for the book, as a proponent would put it. Then
  `### En contra`: the rebuttal. This is separate from *Critiques*, which stays a
  list; this is two short argued paragraphs.
- `## Glosario` — every term the book coins or repurposes, one line each
  (`**término** — definición en una frase`). Alphabetical or in order of appearance.
- `## Teaching outline` — a nested bullet outline of 3–6 sessions someone could
  teach the book from: per session, the topics, one workshop/exercise, and where
  useful a "not in the book" discussion prompt.

## Practice-forward books

Judge from `meta.json`'s Open Library `subjects` and the topic tags you picked
(`self-help`, `business`, `productivity`, `health`, `management`, and often
`finance`): if the book is a how-to / self-improvement / business /
productivity / health / management title, its value *is* the actionable part.
Set `practice_forward: true` in frontmatter and expand **Actionable
takeaways** — keep the exact H2, then under it:

- Group the actions under `### <Theme>` subsections (3–6 themes).
- Each item: the instruction → the principle behind it → a concrete first step
  for this week.
- Add `### Checklist / decision rules` — the book's own tests written as yes/no
  prompts the reader can run against a real situation.
- Add `### Stop doing` — the anti-patterns the book names.
- End with `**If you only do one thing:** …`.
- Aim for 8–20 items total; in `deep` mode fold in the book's own worked
  numbers/examples.

For everything else, set `practice_forward: false` and keep the flat list from
the *Section targets* table.

## Quote verification

After the draft is written — before `check_existing.sh` / `render_pdf.sh` — run:

```
scripts/verify_quotes.py "<workdir>/<Author> - <Title>.md" "<workdir>/book.txt"
```

It normalizes whitespace, quote marks and dashes, splits on `[...]` elisions, and
checks each blockquote against `book.txt`. For any `FAIL`: fix the wording to
match the source, drop the quote, or demote it to a plain (non-blockquote)
paraphrase. Do not ship a summary with a failing quote — re-run until it exits 0.
Offline, no network. Translated editions: it checks against the extracted text,
so it catches quotes you reworded but not translation drift — still quote from
`book.txt` verbatim, not from memory of the original-language edition.

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
(ISO); `depth` is the mode from the *Depth* section above; `practice_forward` is
the boolean from *Practice-forward books*. Leave `rating` blank — the user's to set.

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

Every quote stays **under ~40 words** and is verbatim from the source. Never
include long passages, and never reconstruct a section of the book from
stitched-together quotes — the summary must not substitute for reading it. Within
those rules, `standard` uses 5–15 quotes and `deep` uses 25–40 (~45 max). This is
also what `scripts/verify_quotes.py` enforces mechanically — see *Quote
verification* above.

## Filename

`<Author> - <Title>.md`, author as printed (first name first). Strip
`/ \ : * ? " < > |` and newlines; collapse runs of spaces. The PDF and cover take
the same stem. For a document with no clear author, use the site or publication
name, else just the title.

## Scanned PDFs

If `extract.sh` warned almost no text came out, offer: `ocrmypdf input.pdf ocr.pdf`
then rerun; proceed with the sparse text (note the gap in Critiques); or supply a
different file.
