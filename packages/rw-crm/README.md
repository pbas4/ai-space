# RW CRM

Reusable Realworks CRM UI agents and workflow skills for planning, implementing, reviewing, and documenting component work.

## What it provides

RW CRM is an independently usable Codex plugin package. It exposes composable profiles for:

- `rw-crm-components-planner` — creates a read-only initial implementation plan from relevant Figma, UI-library, CRM-code, and convention context.
- `rw-crm-plan-reviewer` — reviews plans without modifying plans or code.
- `rw-crm-components-engineer` — implements approved component plans after explicit approval of the plan and code edits.
- `rw-crm-ui-reviewer` — performs a read-only post-implementation UI review.
- `rw-crm-pr-description-writer` — drafts a concise PR title and description after implementation and UI review.
- `rw-crm-workflow` — coordinates the standalone planning, approval, implementation, and review flow.

The package can be used independently or consumed by the Create Task Plan plugin and other agents.

## Core safeguards

- Planning and reviews are read-only.
- Implementation requires separate approval of the implementation plan and code edits.
- Approval receipts bind the plan ID and SHA-256 plan hash; code-edit receipts also bind the exact edit-set hash, so changed content requires fresh approval.
- The UI library is authoritative when it conflicts with Figma; conflicts are reported explicitly.
- Missing or ambiguous Figma, library, CRM-code, or convention context is reported rather than guessed.
- Learning-ledger entries are proposed after corrections and persisted only with user approval.
- Changes to the `rw-crm-components` repository require the component version and Pol-attributed changelog update policy.

## Model selection

Before subagents run, the workflow presents a native model-selection prompt with:

- `Recommended` — automatic routing by task complexity and context.
- `Light` — Luna for the workflow, with high reasoning for planning and medium for review/implementation.
- `Medium` — Terra for core planning, implementation, and UI review; Luna for supporting review/orchestration.
- `High` — Sol for analysis/reviews and medium reasoning for implementation.
- `Individual agents` — choose each assignment separately.

The PR Description Writer always uses `gpt-5.6-luna` with light reasoning.

The selected assignment is passed to each worker as immutable execution context. The package validates that contract; the host must honor the requested Codex model and reasoning level or report that it cannot.

## Context and routing

For each task, the package indexes the complete Confluence Best Practices subtree rooted at `21790813` and retrieves only relevant page bodies on demand. Read failures are returned as context gaps.

Tasks are classified as `ui-related`, `possible-ui`, or `non-ui` with evidence. Standalone RW CRM handles `possible-ui`; Create Task Plan auto-invokes it only for `ui-related` work and asks before routing an ambiguous task.

Context snapshots are task-scoped provenance records, not permanent copies of source content. A material refresh of selected sources, scope, library decisions, gaps, or ambiguities requires context reapproval before execution. Host adapters enforce source allowlists before retrieval; they cannot bypass them. Dry runs are read-only, produce redacted audit reports, and never include source bodies or secrets.

## RW CRM workflow

Standalone use follows:

```text
context discovery → model selection → Planner → Plan Reviewer → plan approval
→ code-edit approval → Components Engineer → UI Reviewer → PR description draft
```

The package never creates a pull request. The PR Description Writer is read-only and returns a draft for the user to adapt or approve.

For `rw-crm-components`, the PR draft uses the repository template with PR type checkboxes, description, ticket number, and additional notes. Other repositories receive the normal concise format.

## Installation

From the AI Space marketplace in Claude Code:

```text
/plugin marketplace add pbas4/ai-space
/plugin install rw-crm@ai-space
```

From the Codex marketplace:

```bash
codex plugin add rw-crm@ai-space
```

## Validation

From the package directory:

```bash
npm run validate
```

This runs unit, scenario, and contract tests, followed by the package contract validator.
