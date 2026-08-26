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

## RW CRM workflow

Standalone use follows:

```text
context discovery → model selection → Planner → Plan Reviewer → plan approval
→ code-edit approval → Components Engineer → UI Reviewer → PR description draft
```

The package never creates a pull request. The PR Description Writer is read-only and returns a draft for the user to adapt or approve.

For `rw-crm-components`, the PR draft uses the repository template with PR type checkboxes, description, ticket number, and additional notes. Other repositories receive the normal concise format.

## Installation

From the personal marketplace:

```bash
codex plugin add rw-crm@personal
```

## Validation

From the package directory:

```bash
npm run validate
```

This runs unit, scenario, and contract tests, followed by the package contract validator.
