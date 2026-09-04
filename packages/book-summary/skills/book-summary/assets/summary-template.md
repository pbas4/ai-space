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

<!-- 5–10 bullets. One idea each, stated as a claim, not a topic. -->
{{KEY_IDEAS}}

## Chapter-by-chapter

<!-- One "### N. Chapter title" heading per chapter, 80–200 words under each.
     Follow the titles from the "## CHAPTER:" markers / split index.json.
     No chapters (article, report)? Rename this heading "Section-by-section"
     and follow the source's own headings. Omit entirely at quick depth. -->
{{CHAPTERS}}

## Notable quotes

<!-- 5–15 short quotes, each on its own blockquote line, attributed with
     chapter/section. Keep each quote under ~40 words. -->
{{QUOTES}}

## Actionable takeaways

<!-- Concrete things to try, phrased as instructions. -->
{{TAKEAWAYS}}

## Critiques & open questions

<!-- Where the argument is weak, unsupported, dated, or contested. -->
{{CRITIQUE}}

## How this connects

<!-- Only [[wikilinks]] from related.md (they resolve in the vault), or plain-prose
     bullets naming related books/ideas if there is no related.md. -->
{{CONNECTIONS}}

<!-- deep depth only: append a "## Teaching outline" section here — a nested bullet
     outline someone could teach the book from. Omit at quick/standard depth. -->

---
_Generated with the `book-summary` skill on {{DATE}}._
