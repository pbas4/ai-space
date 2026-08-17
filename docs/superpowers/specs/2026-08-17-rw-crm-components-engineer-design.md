# RW CRM Components Engineer — Design Specification

## Purpose and package boundary

Create a standalone, reusable, composable **RW CRM Components Engineer** package. It can be used independently, called by the existing Create Task Plan plugin, or composed with other agents. It owns component-level UI work from context discovery through implementation and verification.

The package must support:

- creating new RW CRM components;
- fixing bugs in existing components; and
- adding features to existing components.

The package includes an engineer profile, a reusable implementation workflow, a knowledge map, and a versioned learning ledger. This specification defines the behavior and contracts only; it does not implement the package or create a detailed implementation plan.

## Knowledge and context model

The engineer maintains an indexed knowledge map for discovering relevant sources, not a claim of permanent memory of every artifact. The map identifies Figma design-system sources, UI-library sources, and CRM component code. Detailed context is retrieved on demand and refreshed for each task.

Task context and Figma links are the preferred starting points when available. The engineer identifies the relevant files, components, stories, routes, design nodes, tokens, and states, then retrieves only the context needed for the task. It reports missing, stale, inaccessible, or ambiguous context instead of filling gaps with assumptions. Figma files are not treated as permanently retained in full.

When Figma conflicts with the existing UI library, the UI library is authoritative. The engineer must flag the conflict, identify the affected decision, and record which library rule or component contract governs the implementation.

## Engineer profile and workflow

For each task, the engineer:

1. identifies the relevant component, screen, code, library, test, accessibility, and Figma scope;
2. retrieves and summarizes the relevant Figma, UI-library, and CRM-code context;
3. consults the versioned learning ledger, distinguishing stable rules from task-specific exceptions;
4. proposes a bounded implementation plan with affected files/components, behavior, risks, and verification;
5. waits for the user to approve the plan and the proposed code edits;
6. implements only the approved scope;
7. verifies the result with appropriate tests, stories, visual checks, accessibility checks, or other task-relevant evidence; and
8. returns structured status, verification results, unresolved issues, and any proposed learning entry.

The approval gate applies before implementation and remains bounded by the approved scope. A later change in scope requires a new proposal and approval.

## Learning ledger

The package includes a versioned learning ledger with entries classified as either:

- **stable rules**, which are reusable project or design-system guidance; or
- **task-specific exceptions**, which apply only to a named component, screen, flow, or situation.

When a user corrects the engineer, it proposes a concise lesson with evidence, classification, affected scope, and suggested ledger version change. The lesson is persisted only after explicit user approval. Corrections must not be silently generalized into stable rules.

## Collaboration contract

The engineer accepts a task description plus available Figma links, component/screen scope, repository or library references, constraints, and approval state. It returns a structured result containing:

- discovered and retrieved context, including gaps and ambiguities;
- the proposed or approved plan and affected scope;
- implementation status and changed artifacts, when authorized;
- verification evidence and remaining risks;
- Figma-versus-library decisions, with the UI library identified as authoritative for conflicts; and
- a proposed learning entry, if a correction or reusable insight occurred.

The existing Create Task Plan plugin may supply task context and links and may invoke the engineer as a collaborator. The engineer returns structured context, plan, status, and verification to the caller; it does not silently create an implementation plan or bypass the user approval gates. Other agents may call it through the same contract.

The engineer may use focused Figma, code-search, testing, visual-review, and accessibility helpers. Those helpers provide evidence or narrow operations; the RW CRM Components Engineer remains responsible for component decisions, implementation, and verification.

## Errors and safety

The engineer must clearly report missing, conflicting, stale, or inaccessible Figma, library, code, or test context. It must never guess, silently override UI-library decisions, or make unauthorized code or configuration changes. If a safe implementation cannot be determined from the available evidence, it pauses at the proposal stage and states what input or decision is required.

## Validation cases

Package validation must cover at least:

- creating a new component;
- fixing a bug in an existing component;
- extending an existing component with a feature;
- resolving and reporting a Figma/UI-library conflict with the library treated as authoritative; and
- handling an approved user correction by proposing, then persisting only an explicitly approved learning-ledger entry.

Each case should verify the context contract, approval gates, implementation ownership, verification output, and read/write boundaries appropriate to the stage of the workflow.

## Scope boundary

This is the approved brainstorming specification for the reusable engineer package. It does not implement the agent, connect integrations, write code, or define the detailed implementation plan that will follow a separate user-approved design stage.
