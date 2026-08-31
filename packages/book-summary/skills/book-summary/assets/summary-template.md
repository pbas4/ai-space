---
title: "{{TITLE}}"
aliases: []
author: "{{AUTHOR}}"
year: {{YEAR}}
original_title: "{{ORIGINAL_TITLE}}"
original_year: {{ORIGINAL_YEAR}}
isbn: "{{ISBN}}"
publisher: "{{PUBLISHER}}"
source_format: "{{SOURCE_FORMAT}}"
source_file: "{{SOURCE_FILE}}"
date_summarized: {{DATE}}
summarized_by: claude
tags: [book, summary{{TOPIC_TAGS}}]
topics: [{{TOPICS}}]
depth: {{DEPTH}}
practice_forward: {{PRACTICE_FORWARD}}
hook: "{{HOOK}}"
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

<!-- 4–6 sentences: what the book argues and who it is for. No hedging.
     brief: 3–4 sentences. deep: 5–7. -->
{{ELEVATOR}}

## Why read this book

<!-- 2–4 bullets: the payoff. What you can do or see differently afterward. -->
{{WHY}}

## Key ideas

<!-- One idea each, stated as a claim, not a topic.
     brief: 5 bullets. standard: 5–10. deep: 8–15. -->
{{KEY_IDEAS}}

## Chapter-by-chapter

<!-- One "### N. Chapter title" heading per chapter.
     Follow the titles from the "## CHAPTER:" markers in the extracted text /
     split index.json. If the book has no chapters, use its major sections.
     brief: 1–2 sentences per chapter (or per part). standard: 80–200 words.
     deep: 150–300 words, and prefer real chapters over grouping into parts. -->
{{CHAPTERS}}

## Notable quotes

<!-- Each on its own blockquote line, attributed with chapter/section, under
     ~40 words. Quote verbatim — every quote must survive scripts/verify_quotes.py.
     Use [...] for elisions. Do NOT blockquote paraphrases.
     brief: 3–5. standard: 5–15. deep: 10–20. -->
{{QUOTES}}

## Actionable takeaways

<!-- Concrete things to try, phrased as instructions.
     Plain books: a flat list, standard 3–8 items (brief 3, deep 6–10).

     Practice-forward books (practice_forward: true — self-help, business,
     productivity, health, management, or a how-to): this section carries the
     book, so expand it. Keep this exact H2 heading, then under it:
       - "### <Theme>" subsections grouping the actions (3–6 themes).
       - Each item: the instruction, then the principle behind it, then a
         concrete first step to take this week.
       - "### Checklist / decision rules" — the book's tests as yes/no prompts.
       - "### Stop doing" — the anti-patterns the book names.
       - A closing "**If you only do one thing:** ..." line.
     Target 8–20 items total for practice-forward books (brief mode: keep the
     themes but ~1 item each; deep mode: add worked numbers/examples inline). -->
{{TAKEAWAYS}}

## Critiques & open questions

<!-- Where the argument is weak, unsupported, dated, or contested.
     Always write something. brief: 2. standard: 2–5. deep: 4–8. -->
{{CRITIQUE}}

## How this connects

<!-- Links to related ideas or other vault notes as [[wikilinks]]. -->
{{CONNECTIONS}}

<!-- DEEP MODE ONLY. In brief/standard delete everything from here to the ---.
     In deep, keep both H2s and replace the guidance with content.

## Worked examples

One or two of the book's own case studies or scenarios, walked through with its
own numbers and terms so the mechanism is concrete.

## Apply it

A short protocol the reader could run this month: sequenced steps, what to
measure, and the first checkpoint.
-->

---
_Generated with the `book-summary` skill on {{DATE}}._
