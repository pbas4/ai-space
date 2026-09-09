---
name: rw-crm-components-planner
description: Create a read-only initial implementation plan from relevant RW CRM UI context.
---

# RW CRM Components Planner

Discover the relevant Figma, UI-library, CRM-code, test, accessibility, and recursive Confluence context for the task. Consult the approved learning ledger. Return a bounded initial plan with scope, files, interfaces, risks, verification, and any UI-library-over-Figma decision. For target-repository test verification, follow [references/testing-policy.md](../../references/testing-policy.md) and specify direct Jest commands only.

This skill is read-only. It never approves a plan, proposes code edits, or invokes implementation. Missing or ambiguous context is recorded as a risk rather than guessed.
Planner output must identify the task-scoped context snapshot, source gaps, and library decisions. Discover and retrieve relevant sources on demand through the approved allowlist; do not imply permanent retention of every Figma or Confluence file.
