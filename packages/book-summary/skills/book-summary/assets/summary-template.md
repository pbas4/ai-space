---
title: "{{TITLE}}"
aliases: []
author: "{{AUTHOR}}"
year: {{YEAR}}
isbn: "{{ISBN}}"
publisher: "{{PUBLISHER}}"
source_format: "{{SOURCE_FORMAT}}"   # epub | pdf | docx | html | txt | url
source_file: "{{SOURCE_FILE}}"
date_summarized: {{DATE}}
summarized_by: claude
tags: [book, summary{{TOPIC_TAGS}}]
topics: [{{TOPICS}}]
depth: {{DEPTH}}
practice_forward: {{PRACTICE_FORWARD}}
rating:
status: to-review
cover: "{{COVER}}"
cssclasses: [book-summary]
---

# {{TITLE}}

_{{AUTHOR}} · {{YEAR}}_

<!-- If a cover was saved, embed it here, else delete this line:
![[{{COVER}}|200]] -->

## In one paragraph

<!-- standard: 4–6 sentences — the thesis and who it's for. No hedging.
     deep: 2–3 paragraphs — thesis, how the argument is built, who it's for/not for. -->
{{ELEVATOR}}

## Why read this book

<!-- 2–4 bullets: the payoff. What you can do or see differently afterward. -->
{{WHY}}

## Key ideas

<!-- standard: 5–10 bullets, one claim each (not a topic).
     deep: the load-bearing claims only (aim 15–25, ~35 max), each claim + a
     clause on why it holds or where it's weak; group under "### <theme>" past ~12. -->
{{KEY_IDEAS}}

## Chapter-by-chapter

<!-- One "### N. Chapter title" heading per chapter, titles VERBATIM from the
     "## CHAPTER:" markers / split index.json — never invent, shorten, or
     re-translate them. No chapters (article, report)? Rename this heading
     "Section-by-section" and follow the source's own headings.
     standard: 80–200 words/section.
     deep: 200–400 words/section — the argumentative move, its evidence, every
     named example; prefer the book's real chapters over grouping into parts
     when there are a manageable number of them.
     Omit this section entirely at quick depth. -->
{{CHAPTERS}}

## Notable quotes

<!-- Each on its own blockquote line, attributed with chapter/section, <40
     words, verbatim from the source (no paraphrases as blockquotes; use
     "[...]" for elisions) — every quote must pass `scripts/verify_quotes.py`.
     standard: 5–15.  deep: 25–40 (~45 max), grouped under "### <theme>". -->
{{QUOTES}}

## Actionable takeaways

<!-- Concrete things to try, phrased as instructions.
     Plain books: a flat list. standard: 3–8 items. deep: 6–12.

     Practice-forward books (practice_forward: true — self-help, business,
     productivity, health, management, or a how-to): this section carries the
     book, so expand it. Keep this exact H2 heading, then under it:
       - "### <Theme>" subsections grouping the actions (3–6 themes).
       - Each item: the instruction, then the principle behind it, then a
         concrete first step to take this week.
       - "### Checklist / decision rules" — the book's tests as yes/no prompts.
       - "### Stop doing" — the anti-patterns the book names.
       - A closing "**If you only do one thing:** ..." line.
     Target 8–20 items total for practice-forward books (deep mode: fold in the
     book's own worked numbers/examples). -->
{{TAKEAWAYS}}

## Critiques & open questions

<!-- Where the argument is weak, unsupported, dated, or contested. Always write
     something. standard: 2–5 bullets. deep: 6–12, specific and unsparing. -->
{{CRITIQUE}}

## How this connects

<!-- Only [[wikilinks]] from related.md (they resolve in the vault), or plain-prose
     bullets naming related books/ideas if there is no related.md.
     standard: 2–5 bullets.  deep: 4–8, each drawing the actual distinction. -->
{{CONNECTIONS}}

<!-- deep depth ONLY — append these three sections here, in this order, then the
     closing "---". Omit them entirely at quick/standard depth.

## Contexto y contraargumento
### A favor
<!-- one paragraph: the strongest good-faith case for the book -->
### En contra
<!-- one paragraph: the rebuttal -->

## Glosario
<!-- every term the book coins or repurposes, one line each:
     **término** — definición en una frase -->

## Teaching outline
<!-- 3–6 sessions someone could teach from; per session: topics as nested bullets,
     one workshop/exercise, and a "no está en el libro" discussion prompt where useful -->
-->

---
_Generated with the `book-summary` skill on {{DATE}}._
