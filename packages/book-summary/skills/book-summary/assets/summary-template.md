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

<!-- 4–6 sentences: what the book argues and who it is for. No hedging. -->
{{ELEVATOR}}

## Why read this book

<!-- 2–4 bullets: the payoff. What you can do or see differently afterward. -->
{{WHY}}

## Key ideas

<!-- standard: 5–10 bullets, one claim each (not a topic).
     deep: uncapped — as many as the book earns (often 15–30), each claim + a
     clause on why it holds or where it's weak; group under "### <theme>" past ~12. -->
{{KEY_IDEAS}}

## Chapter-by-chapter

<!-- One "### N. Chapter title" heading per chapter, 80–200 words under each.
     Follow the titles from the "## CHAPTER:" markers / split index.json.
     No chapters (article, report)? Rename this heading "Section-by-section"
     and follow the source's own headings. Omit entirely at quick depth. -->
{{CHAPTERS}}

## Notable quotes

<!-- Each on its own blockquote line, attributed with chapter/section, <40 words.
     standard: 5–15.  deep: uncapped (often 25–50), grouped under "### <theme>". -->
{{QUOTES}}

## Actionable takeaways

<!-- Concrete things to try, phrased as instructions. -->
{{TAKEAWAYS}}

## Critiques & open questions

<!-- Where the argument is weak, unsupported, dated, or contested. -->
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
