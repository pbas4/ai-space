# RW CRM Components Engineer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, composable RW CRM Components Engineer package that discovers current task context, proposes bounded component work, waits for plan-and-edit approval, implements approved changes, verifies them, and proposes user-approved ledger learning without modifying the existing Create Task Plan plugin.

**Architecture:** The package is a small, dependency-free Node/ESM contract layer plus Codex-facing profile and skill instructions. The profile and skill define the agent behavior; typed JSON envelopes and pure modules enforce context discovery, approval gates, conflict decisions, collaboration results, and ledger persistence. Focused adapters provide Figma, Confluence best-practices, UI-library, CRM-code, testing, and accessibility evidence while the Components Engineer owns component decisions and implementation.

**Tech Stack:** Codex plugin manifest; Markdown profile/skill/reference files; Node.js ESM; JSON Schema Draft 2020-12; Node built-in `node:test` and `node:assert/strict`; no third-party runtime dependencies.

## Global Constraints

- The package is independently usable and callable by the Create Task Plan plugin or other agents.
- The UI library is authoritative when it conflicts with Figma; every conflict must be surfaced as a decision.
- Figma and Confluence context is indexed and retrieved on demand; the package must not claim permanent retention of every file or page.
- The full Confluence subtree rooted at page `21790813` is in scope, including every nested descendant discovered recursively.
- Implementation requires explicit approval of both the proposed plan and the proposed code edits.
- Learning-ledger entries are proposed after corrections and persisted only after explicit user approval.
- Stable rules and task-specific exceptions remain separate ledger categories.
- Missing, stale, inaccessible, or conflicting context is reported; the agent never guesses or silently overrides a library decision.
- The Create Task Plan plugin is an integration consumer only; this package does not modify that plugin.
- RW frontend conventions include Shared Form/Form.Item validation and labels, warning-free linting, shared-library styling assets, limited z-index and component size, typed modern code, single-owner state, and applicable GraphQL/Apollo, Jest, and ESLint tooling.
- No task in this plan implements a CRM component; package implementation and package-contract validation are the only code scope.

---

## File Map and Package Boundaries

Create the following standalone package under `packages/rw-crm-components-engineer/`:

- `packages/rw-crm-components-engineer/.codex-plugin/plugin.json` — plugin identity and exported profile/skill entry points.
- `packages/rw-crm-components-engineer/agents/rw-crm-components-engineer.yaml` — dedicated engineer profile, invocation triggers, permissions, and output contract.
- `packages/rw-crm-components-engineer/skills/rw-crm-components-engineer/SKILL.md` — reusable Codex workflow instructions and approval gates.
- `packages/rw-crm-components-engineer/references/workflow.md` — human-readable lifecycle and decision rules referenced by the skill.
- `packages/rw-crm-components-engineer/references/rw-conventions.md` — indexed source registry and refresh rules for the full Confluence subtree and current UI conventions.
- `packages/rw-crm-components-engineer/schemas/context-envelope.schema.json` — input/context-discovery contract.
- `packages/rw-crm-components-engineer/schemas/engineer-result.schema.json` — structured plan/status/verification/learning output contract.
- `packages/rw-crm-components-engineer/schemas/learning-ledger.schema.json` — versioned stable-rule/exception ledger contract.
- `packages/rw-crm-components-engineer/src/contracts.mjs` — runtime constants and envelope validation helpers.
- `packages/rw-crm-components-engineer/src/context/context-map.mjs` — source indexing, recursive descendant discovery, relevance selection, and ambiguity reporting.
- `packages/rw-crm-components-engineer/src/ledger/learning-ledger.mjs` — read, classify, propose, approve, and persist ledger entries.
- `packages/rw-crm-components-engineer/src/workflow/approval-gate.mjs` — plan/edit approval state machine.
- `packages/rw-crm-components-engineer/src/workflow/engineer-workflow.mjs` — orchestration boundary; adapters supply evidence, engineer owns decisions.
- `packages/rw-crm-components-engineer/src/adapters/README.md` — adapter interface and focused-helper boundary; no external connector implementation in this package.
- `packages/rw-crm-components-engineer/test/*.test.mjs` — unit and contract tests.
- `packages/rw-crm-components-engineer/test/fixtures/*.json` — five accepted validation scenarios plus missing/conflict context.
- `packages/rw-crm-components-engineer/scripts/validate-package.mjs` — dependency-free schema/fixture/package contract check.
- `packages/rw-crm-components-engineer/package.json` — ESM metadata and exact test/validation scripts.

The package boundary is: adapters may read external evidence; `context-map` normalizes it; `engineer-workflow` proposes and executes only approved component work; `approval-gate` controls writes; `learning-ledger` controls durable learning; schemas define all caller/callee data. No module may directly mutate Figma, the UI library, the Create Task Plan plugin, or unrelated repository files.

## Interfaces

All interfaces use JSON-serializable objects. The following signatures are normative:

```js
export function createContextEnvelope(input) {}
export function discoverRelevantContext(envelope, sourceIndex, adapter) {}
// returns Promise<{
//   scope: { components: string[], screens: string[], routes: string[] },
//   sources: Array<{ id: string, kind: string, uri: string, freshness: string }>,
//   evidence: Array<{ sourceId: string, summary: string }>,
//   gaps: Array<{ sourceId?: string, reason: string, impact: string }>,
//   ambiguities: Array<{ topic: string, candidates: string[], decisionRequired: string }>,
//   libraryDecisions: Array<{ topic: string, figma: string, library: string, authority: "ui-library", decision: string }>
// }>

export function proposeLearningEntry(ledger, correction) {}
export function approveLearningEntry(ledger, proposalId) {}
// returns { ledgerVersion: number, entries: Array<LedgerEntry>, persisted: boolean }

export function createApprovalState() {}
export function approvePlan(state, approval) {}
export function approveCodeEdits(state, approval) {}
export function assertImplementationAuthorized(state) {}

export async function runEngineerWorkflow(request, deps) {}
// returns {
//   context: ContextReport,
//   plan: Plan | null,
//   status: "needs-context" | "awaiting-plan-approval" | "awaiting-edit-approval" | "implemented" | "blocked",
//   changedArtifacts: string[],
//   verification: VerificationReport,
//   proposedLearningEntry: LearningProposal | null
// }
```

The external collaborator contract is: `request = { task, figmaLinks, componentScope, repositoryScope, constraints, approvals }`; `deps = { sourceIndex, contextAdapter, implementationAdapter, verifier, ledger }`. `implementationAdapter.apply(approvedPlan, approvedEdits)` is never called before both approvals; `verifier.run(scope, changedArtifacts)` returns evidence or explicit unavailable checks.

---

### Task 1: Scaffold the standalone package and profile contract

**Files:**
- Create: `packages/rw-crm-components-engineer/package.json`
- Create: `packages/rw-crm-components-engineer/.codex-plugin/plugin.json`
- Create: `packages/rw-crm-components-engineer/agents/rw-crm-components-engineer.yaml`
- Create: `packages/rw-crm-components-engineer/skills/rw-crm-components-engineer/SKILL.md`
- Create: `packages/rw-crm-components-engineer/test/package-contract.test.mjs`
- Create: `packages/rw-crm-components-engineer/scripts/validate-package.mjs`

**Interfaces:**
- Produces the package identity `rw-crm-components-engineer`, profile `rw-crm-components-engineer`, and skill `rw-crm-components-engineer` for all later tasks.
- Profile triggers are Figma-linked tasks, explicit invocation, and clear component/frontend work.

- [ ] **Step 1: Write the failing package contract test.** Assert the manifest, profile, skill, package scripts, and required profile fields exist; assert the profile declares independent use, composability, approval-before-write, and structured output.
- [ ] **Step 2: Run the contract test.**

  Run: `node --test packages/rw-crm-components-engineer/test/package-contract.test.mjs`

  Expected: FAIL because the package files do not exist.
- [ ] **Step 3: Write the minimal manifest, profile, skill stub, package metadata, and validator.** Use ESM, `node --test`, and `node scripts/validate-package.mjs`; the skill must state that it owns component work and may use focused helpers.
- [ ] **Step 4: Run the contract test and validator.**

  Run: `node --test packages/rw-crm-components-engineer/test/package-contract.test.mjs && node packages/rw-crm-components-engineer/scripts/validate-package.mjs`

  Expected: PASS; validator prints `RW CRM Components Engineer package contract: PASS`.
- [ ] **Step 5: Commit.**

  ```bash
  git add packages/rw-crm-components-engineer
  git commit -m "feat: scaffold RW CRM Components Engineer package"
  ```

### Task 2: Define schemas and runtime contract helpers

**Files:**
- Create: `packages/rw-crm-components-engineer/schemas/context-envelope.schema.json`
- Create: `packages/rw-crm-components-engineer/schemas/engineer-result.schema.json`
- Create: `packages/rw-crm-components-engineer/schemas/learning-ledger.schema.json`
- Create: `packages/rw-crm-components-engineer/src/contracts.mjs`
- Create: `packages/rw-crm-components-engineer/test/contracts.test.mjs`
- Modify: `packages/rw-crm-components-engineer/scripts/validate-package.mjs`

**Interfaces:**
- `ContextEnvelope` requires `task`, `componentScope`, `repositoryScope`, `figmaLinks`, `constraints`, and `approvals`.
- `EngineerResult` requires `context`, `plan`, `status`, `changedArtifacts`, `verification`, and `proposedLearningEntry`.
- `LedgerEntry` requires `id`, `version`, `class`, `lesson`, `evidence`, `scope`, and `approvedAt` when persisted.

- [ ] **Step 1: Write failing tests for valid envelopes/results and rejection of missing task, unknown ledger class, and persisted entries without approval.**
- [ ] **Step 2: Run `node --test packages/rw-crm-components-engineer/test/contracts.test.mjs`; expect FAIL because schemas/helpers are absent.**
- [ ] **Step 3: Implement JSON schemas and `createContextEnvelope`, `validateContextEnvelope`, `validateEngineerResult`, and `validateLedgerEntry` using deterministic structural checks with error paths.**
- [ ] **Step 4: Run `node --test packages/rw-crm-components-engineer/test/contracts.test.mjs && node packages/rw-crm-components-engineer/scripts/validate-package.mjs`; expect PASS and zero schema errors.**
- [ ] **Step 5: Commit with `git add packages/rw-crm-components-engineer && git commit -m "feat: define engineer data contracts"`.**

### Task 3: Build indexed, on-demand context discovery

**Files:**
- Create: `packages/rw-crm-components-engineer/src/context/context-map.mjs`
- Create: `packages/rw-crm-components-engineer/references/rw-conventions.md`
- Create: `packages/rw-crm-components-engineer/test/context-map.test.mjs`
- Create: `packages/rw-crm-components-engineer/test/fixtures/context-index.json`

**Interfaces:**
- `buildSourceIndex({ figma, uiLibrary, crmCode, confluenceRoot })` returns normalized source records with `id`, `kind`, `uri`, `parentId`, `lastIndexedAt`, and `refreshPolicy`.
- `discoverConfluenceTree(rootId, listChildren)` recursively returns every descendant, detects cycles, and reports inaccessible pages.
- `selectRelevantSources(envelope, index)` returns ordered sources plus `gaps` and `ambiguities`; it does not fetch bodies.
- `refreshSources(sources, fetchSource)` fetches only selected sources and marks freshness.

- [ ] **Step 1: Write failing tests for Figma-link matching, component/code scope matching, recursive Confluence descendants, stale-source refresh, and missing/ambiguous source reporting.** Include the known root `21790813` and nested fixture descendants.
- [ ] **Step 2: Run `node --test packages/rw-crm-components-engineer/test/context-map.test.mjs`; expect FAIL because discovery functions are absent.**
- [ ] **Step 3: Implement pure index selection and recursive traversal; apply the full conventions subtree rule and never represent source bodies as permanent memory.**
- [ ] **Step 4: Run the context tests; expect PASS with all nested descendants returned, stale sources selected for refresh, and no silent omissions.**
- [ ] **Step 5: Commit with `git add packages/rw-crm-components-engineer && git commit -m "feat: add indexed on-demand context discovery"`.**

### Task 4: Implement the approval-based learning ledger

**Files:**
- Create: `packages/rw-crm-components-engineer/src/ledger/learning-ledger.mjs`
- Create: `packages/rw-crm-components-engineer/test/learning-ledger.test.mjs`
- Modify: `packages/rw-crm-components-engineer/schemas/learning-ledger.schema.json`

**Interfaces:**
- `readLedger(store)` returns `{ version, entries }`.
- `proposeLearningEntry(ledger, correction)` returns an unpersisted `LearningProposal` with `class: "stable-rule" | "task-exception"`.
- `approveLearningEntry(ledger, proposalId)` increments the ledger version and persists exactly one approved entry.
- `rejectLearningEntry(ledger, proposalId)` leaves version and entries unchanged.

- [ ] **Step 1: Write failing tests proving a correction produces a proposal only, stable rules and exceptions remain distinct, approval persists/version-bumps, and rejection does not mutate storage.**
- [ ] **Step 2: Run `node --test packages/rw-crm-components-engineer/test/learning-ledger.test.mjs`; expect FAIL.**
- [ ] **Step 3: Implement immutable proposal/reject paths and atomic approved persistence with explicit evidence and scope.**
- [ ] **Step 4: Run the ledger tests and validator; expect PASS and no entry persisted without `approvedAt`.**
- [ ] **Step 5: Commit with `git add packages/rw-crm-components-engineer && git commit -m "feat: add approval-based learning ledger"`.**

### Task 5: Enforce plan and code-edit approval gates

**Files:**
- Create: `packages/rw-crm-components-engineer/src/workflow/approval-gate.mjs`
- Create: `packages/rw-crm-components-engineer/test/approval-gate.test.mjs`
- Modify: `packages/rw-crm-components-engineer/schemas/engineer-result.schema.json`

**Interfaces:**
- States are `needs-context`, `awaiting-plan-approval`, `awaiting-edit-approval`, `authorized`, and `blocked`.
- `approvePlan(state, { planId, approvedBy, approvedAt })` transitions only from `awaiting-plan-approval`.
- `approveCodeEdits(state, { planId, editSetHash, approvedBy, approvedAt })` transitions only after matching plan approval.
- `assertImplementationAuthorized(state)` throws a typed `ApprovalRequiredError` unless state is `authorized`.

- [ ] **Step 1: Write failing tests for missing context, plan-only approval, mismatched edit-set approval, authorized implementation, and scope expansion requiring a new approval.**
- [ ] **Step 2: Run `node --test packages/rw-crm-components-engineer/test/approval-gate.test.mjs`; expect FAIL.**
- [ ] **Step 3: Implement the explicit state machine and typed errors; store plan ID and edit-set hash to prevent approval drift.**
- [ ] **Step 4: Run the approval tests; expect PASS and all unauthorized write attempts rejected.**
- [ ] **Step 5: Commit with `git add packages/rw-crm-components-engineer && git commit -m "feat: enforce engineer approval gates"`.**

### Task 6: Implement the composable engineer workflow and adapter boundary

**Files:**
- Create: `packages/rw-crm-components-engineer/src/workflow/engineer-workflow.mjs`
- Create: `packages/rw-crm-components-engineer/src/adapters/README.md`
- Create: `packages/rw-crm-components-engineer/references/workflow.md`
- Create: `packages/rw-crm-components-engineer/test/engineer-workflow.test.mjs`

**Interfaces:**
- `contextAdapter.discover(request)` returns `ContextReport`.
- `implementationAdapter.propose(context, request)` returns `Plan` and `editSetHash`; `apply(plan, edits)` is write-capable and is called only after `assertImplementationAuthorized`.
- `verifier.run(scope, changedArtifacts)` returns `VerificationReport` with checks `{ name, status: "passed" | "failed" | "unavailable", evidence }`.
- `runEngineerWorkflow(request, deps)` returns the normative `EngineerResult` from the package interface.

- [ ] **Step 1: Write failing workflow tests for context-first ordering, plan output, plan/edit approvals, blocked missing context, library-over-Figma decisions, helper isolation, and structured result fields.**
- [ ] **Step 2: Run `node --test packages/rw-crm-components-engineer/test/engineer-workflow.test.mjs`; expect FAIL.**
- [ ] **Step 3: Implement orchestration that selects context, consults the ledger, proposes a plan, pauses for approvals, applies only approved edits, and returns verification plus proposed learning.**
- [ ] **Step 4: Run the workflow tests; expect PASS with a spy proving `implementationAdapter.apply` is never called before both approvals.**
- [ ] **Step 5: Commit with `git add packages/rw-crm-components-engineer && git commit -m "feat: add composable engineer workflow"`.**

### Task 7: Document RW conventions, conflict policy, profile workflow, and plugin consumer contract

**Files:**
- Modify: `packages/rw-crm-components-engineer/agents/rw-crm-components-engineer.yaml`
- Modify: `packages/rw-crm-components-engineer/skills/rw-crm-components-engineer/SKILL.md`
- Modify: `packages/rw-crm-components-engineer/references/workflow.md`
- Modify: `packages/rw-crm-components-engineer/references/rw-conventions.md`
- Create: `packages/rw-crm-components-engineer/test/instruction-contract.test.mjs`
- Create: `packages/rw-crm-components-engineer/references/create-task-plan-consumer-contract.md`

**Interfaces:**
- The profile accepts `{ task, figmaLinks, componentScope, repositoryScope, constraints, approvals }` and returns the `EngineerResult` envelope.
- The Create Task Plan consumer supplies task context and links and receives context, proposed/approved plan, status, verification, and proposed learning; it does not receive permission to bypass gates or cause package-side plugin edits.

- [ ] **Step 1: Write failing instruction tests that search for every trigger, every approval gate, full recursive Confluence subtree, UI-library authority, no-guessing rule, stable/exception ledger distinction, and consumer boundary.**
- [ ] **Step 2: Run `node --test packages/rw-crm-components-engineer/test/instruction-contract.test.mjs`; expect FAIL for incomplete instructions.**
- [ ] **Step 3: Write the complete profile, skill, workflow reference, conventions source registry, and consumer contract. Include focused Figma/code/testing/accessibility helpers while stating that the Components Engineer owns component work.**
- [ ] **Step 4: Run the instruction test and package validator; expect PASS with every required phrase/contract present.**
- [ ] **Step 5: Commit with `git add packages/rw-crm-components-engineer && git commit -m "docs: define engineer workflow and integration contract"`.**

### Task 8: Add the five accepted validation scenarios and full verification command

**Files:**
- Create: `packages/rw-crm-components-engineer/test/validation-scenarios.test.mjs`
- Create: `packages/rw-crm-components-engineer/test/fixtures/new-component.json`
- Create: `packages/rw-crm-components-engineer/test/fixtures/bug-fix.json`
- Create: `packages/rw-crm-components-engineer/test/fixtures/feature-extension.json`
- Create: `packages/rw-crm-components-engineer/test/fixtures/figma-conflict.json`
- Create: `packages/rw-crm-components-engineer/test/fixtures/approved-correction.json`
- Modify: `packages/rw-crm-components-engineer/scripts/validate-package.mjs`
- Modify: `packages/rw-crm-components-engineer/package.json`

**Interfaces:**
- Each fixture is a valid `ContextEnvelope` with a scenario ID and expected status transitions.
- The scenario runner invokes `runEngineerWorkflow` with deterministic fake adapters and asserts result schema, approval behavior, verification evidence, and ledger persistence.

- [ ] **Step 1: Write five failing scenario tests:** new component reaches implemented after approvals; existing bug fix changes only approved scope; feature extension verifies regression coverage; Figma conflict returns a library-authoritative decision; approved correction persists exactly one ledger entry while unapproved correction does not.
- [ ] **Step 2: Run `node --test packages/rw-crm-components-engineer/test/validation-scenarios.test.mjs`; expect FAIL because fixtures/runner are absent.**
- [ ] **Step 3: Add deterministic fixtures and scenario assertions, including unavailable-context evidence and no silent writes.**
- [ ] **Step 4: Add scripts `test:unit`, `test:scenarios`, `test:contract`, and `validate` to `package.json`; make `validate` run all tests plus package validation.**
- [ ] **Step 5: Run the exact full suite from the repository root:**

  ```bash
  npm --prefix packages/rw-crm-components-engineer run validate
  ```

  Expected: all Node tests pass, the validator prints `RW CRM Components Engineer package contract: PASS`, and the process exits `0`.
- [ ] **Step 6: Commit with `git add packages/rw-crm-components-engineer && git commit -m "test: validate accepted engineer scenarios"`.**

## Final Self-Review Checklist

Before implementation begins, the implementer must confirm:

- every approved specification section maps to Tasks 1–8;
- no task changes the existing Create Task Plan plugin;
- all interfaces use the same field names and approval state transitions;
- recursive Confluence discovery includes future descendants and reports omissions;
- Figma conflicts always produce a UI-library-authoritative decision;
- missing context blocks implementation rather than triggering guesses;
- ledger proposals remain unpersisted until explicit approval;
- each validation scenario checks both behavior and write boundaries; and
- `npm --prefix packages/rw-crm-components-engineer run validate` is green before any implementation-complete claim.

## Specification Coverage Matrix

| Approved requirement | Planned coverage |
|---|---|
| Standalone, composable package and engineer profile | Tasks 1 and 7: manifest, profile, skill, adapter boundary |
| New components, bug fixes, and feature extensions | Task 8: three deterministic validation fixtures and workflow assertions |
| Reusable workflow, knowledge map, and versioned ledger | Tasks 2–6: schemas, context map, ledger, approval gate, orchestration |
| Indexed/on-demand Figma, UI-library, CRM-code, and full Confluence context | Task 3 and `references/rw-conventions.md` |
| UI library authoritative over Figma | Tasks 3, 6, 7, and 8 conflict scenario |
| Context → ledger → plan → dual approval → implementation → verification | Tasks 5 and 6, enforced by call-order tests |
| User-approved learning persistence and rule/exception distinction | Task 4 and Task 8 correction scenario |
| Composable collaboration contract and focused helpers | Tasks 2, 6, and 7 |
| Missing/conflicting context safety | Tasks 3, 5, 6, and 8 |
| Create Task Plan as consumer only | Task 7 consumer contract; no plugin files in the package file map |
