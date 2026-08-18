# RW CRM Package Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing Components Engineer package into `packages/rw-crm/`, add independent Planner, Plan Reviewer, UI Reviewer, and Workflow Orchestrator subagents, and provide shared context, approval, learning, verification, and dynamic model-routing capabilities.

**Architecture:** Keep one dependency-free Node/ESM package with independent Codex profiles and skills backed by shared JSON contracts and pure modules. The Planner creates initial plans, the Plan Reviewer reviews them only outside the Create Task Plan plugin, the Engineer implements only an approved plan and approved edit set, the UI Reviewer reviews every implementation, and the optional Orchestrator coordinates the flow with explicit model confirmations.

**Tech Stack:** Codex plugin manifest; YAML profiles; Markdown skills/references; Node.js ESM; JSON Schema Draft 2020-12; Node built-in `node:test` and `node:assert/strict`; no third-party runtime dependencies.

## Global Constraints

- The package root is `packages/rw-crm/`.
- The package contains independent profiles for Workflow, Components Planner, Plan Reviewer, Components Engineer, and UI Reviewer.
- The Planner is read-only and returns an initial plan only.
- The Plan Reviewer is read-only and is used outside the Create Task Plan plugin; the plugin uses its own brainstorming planning review instead.
- The Components Engineer may write only after explicit approval of both the final plan and the concrete code-edit set.
- The UI Reviewer runs after every Components Engineer task, including non-visual code changes; critical findings block completion.
- All subagents use shared indexed/on-demand Figma, UI-library, CRM-code, test, accessibility, and recursive Confluence context.
- The full Confluence subtree rooted at page `21790813` is in scope, including every current and future descendant.
- The UI library is authoritative when it conflicts with Figma; all agents must flag and record the decision.
- The Create Task Plan plugin is a thin consumer only; do not modify its source in this repository.
- Explicit user invocation overrides automatic UI-task routing; clearly non-UI tasks are skipped automatically.
- Model selection is dynamic. The user must see and approve a model execution proposal before orchestration, and every model escalation requires a new confirmation.
- Learning entries may be proposed by any subagent but persist only after explicit user approval; stable rules and task-specific exceptions remain distinct.
- Missing, stale, inaccessible, or ambiguous context blocks unsafe implementation; no agent guesses or silently overrides a library decision.
- The package remains independently usable without the Create Task Plan plugin.
- Use TDD for all behavior changes: write a failing test, observe the expected failure, implement the minimum behavior, then rerun the focused and full suites.

---

## Target File Map and Boundaries

Move the current package files from `packages/rw-crm-components-engineer/` into `packages/rw-crm/`, preserving their behavior unless a task explicitly refactors it. The final package owns:

- `packages/rw-crm/.codex-plugin/plugin.json` — package identity and all profile/skill entry points.
- `packages/rw-crm/package.json` — ESM metadata and focused/full validation scripts.
- `packages/rw-crm/agents/rw-crm-workflow.yaml` — optional orchestrator profile.
- `packages/rw-crm/agents/rw-crm-components-planner.yaml` — initial-plan profile.
- `packages/rw-crm/agents/rw-crm-plan-reviewer.yaml` — standalone plan-review profile.
- `packages/rw-crm/agents/rw-crm-components-engineer.yaml` — refactored implementation profile.
- `packages/rw-crm/agents/rw-crm-ui-reviewer.yaml` — read-only implementation-review profile.
- `packages/rw-crm/skills/rw-crm-workflow/SKILL.md` — orchestration, routing, model confirmation, and approval instructions.
- `packages/rw-crm/skills/rw-crm-components-planner/SKILL.md` — context-to-initial-plan workflow.
- `packages/rw-crm/skills/rw-crm-plan-reviewer/SKILL.md` — repeatable standalone plan-review checklist.
- `packages/rw-crm/skills/rw-crm-components-engineer/SKILL.md` — approved-plan implementation workflow.
- `packages/rw-crm/skills/rw-crm-ui-reviewer/SKILL.md` — read-only post-implementation review workflow.
- `packages/rw-crm/references/rw-conventions.md` — source registry and refresh rules for the complete conventions subtree.
- `packages/rw-crm/references/create-task-plan-consumer-contract.md` — consumer-only integration contract; no plugin edits.
- `packages/rw-crm/references/review-checklist.md` — shared plan and implementation review criteria.
- `packages/rw-crm/references/model-policy.md` — dynamic tiers, defaults, confirmation prompt, and escalation rules.
- `packages/rw-crm/schemas/context-envelope.schema.json` — shared task/context input.
- `packages/rw-crm/schemas/initial-plan.schema.json` — Planner output.
- `packages/rw-crm/schemas/plan-review.schema.json` — Plan Reviewer output.
- `packages/rw-crm/schemas/engineer-result.schema.json` — Engineer output.
- `packages/rw-crm/schemas/ui-review.schema.json` — UI Reviewer output.
- `packages/rw-crm/schemas/model-proposal.schema.json` — model execution/override/approval record.
- `packages/rw-crm/schemas/learning-ledger.schema.json` — versioned learning entries.
- `packages/rw-crm/src/contracts.mjs` — shared structural validators and envelope constructors.
- `packages/rw-crm/src/context/context-map.mjs` — shared source indexing, recursive discovery, relevance selection, and refresh.
- `packages/rw-crm/src/ledger/learning-ledger.mjs` — shared proposal, approval, rejection, and persistence behavior.
- `packages/rw-crm/src/workflow/approval-gate.mjs` — shared plan/edit approval state machine.
- `packages/rw-crm/src/workflow/engineer-workflow.mjs` — refactored approved-plan implementation flow.
- `packages/rw-crm/src/planning/components-planner.mjs` — initial plan generation boundary.
- `packages/rw-crm/src/planning/plan-reviewer.mjs` — standalone plan review boundary.
- `packages/rw-crm/src/review/ui-reviewer.mjs` — implementation review and severity/blocking policy.
- `packages/rw-crm/src/routing/model-router.mjs` — complexity classification, model proposals, overrides, and escalation confirmation.
- `packages/rw-crm/src/routing/ui-task-router.mjs` — plugin routing decisions and explicit-invocation override.
- `packages/rw-crm/src/workflow/rw-crm-orchestrator.mjs` — optional end-to-end coordination.
- `packages/rw-crm/src/adapters/README.md` — focused-helper interface and ownership boundary.
- `packages/rw-crm/scripts/validate-package.mjs` — package structure, schema, profile, reference, and fixture validation.
- `packages/rw-crm/test/*.test.mjs` — focused unit, profile, routing, workflow, and scenario tests.
- `packages/rw-crm/test/fixtures/*.json` — deterministic task, context, model, review, conflict, and learning scenarios.

Module boundaries are strict: adapters provide evidence; context-map normalizes evidence; Planner and Plan Reviewer produce/read plans; approval-gate controls writes; Engineer owns implementation; UI Reviewer owns post-implementation findings; model-router controls model selection; Orchestrator coordinates without bypassing any subagent contract.

## Shared Interfaces

All interfaces are JSON-serializable and use the following names consistently:

```js
export function createContextEnvelope(input) {}
export async function discoverRelevantContext(envelope, sourceIndex, adapter) {}

export async function createInitialPlan(request, deps) {}
export async function reviewPlan(request, deps) {}
export async function reviewImplementation(request, deps) {}

export function classifyTask(request, contextSummary) {}
export function proposeModelExecution(request, classification, defaults) {}
export function approveModelExecution(proposal, approval) {}
export function requestModelEscalation(current, target, reason) {}

export async function runEngineerWorkflow(request, deps) {}
export async function runRwCrmOrchestrator(request, deps) {}
```

The shared request is:

```js
{
  task,
  figmaLinks,
  componentScope,
  repositoryScope,
  constraints,
  environment: 'standalone' | 'create-task-plan-plugin',
  approvals: { plan, codeEdits },
  modelApproval
}
```

The Orchestrator returns `{ routing, modelProposal, planner, planReview, planApproval, engineer, uiReview, status }`. `planReview` is populated only in standalone mode; plugin mode records `{ mode: 'plugin-brainstorming-review', delegated: true }` and does not invoke the package Plan Reviewer by default.

---

### Task 1: Move and rebrand the package without changing behavior

**Files:**
- Move: `packages/rw-crm-components-engineer/` → `packages/rw-crm/`
- Modify: `packages/rw-crm/package.json`
- Modify: `packages/rw-crm/.codex-plugin/plugin.json`
- Modify: `packages/rw-crm/scripts/validate-package.mjs`
- Create: `packages/rw-crm/test/package-migration.test.mjs`

**Interfaces:**
- Produces package identity `rw-crm` and preserves existing technical identifier `rw-crm-components-engineer` for the Engineer profile.
- Existing shared modules and tests remain importable under the new root.

- [ ] **Step 1: Write the failing migration test.** Assert `packages/rw-crm/` exists, the old root does not, manifest name is `rw-crm`, current package scripts point to the new root-relative paths, and the Engineer technical ID remains present.
- [ ] **Step 2: Run `node --test packages/rw-crm-components-engineer/test/package-migration.test.mjs`; expect FAIL because the target package does not exist.**
- [ ] **Step 3: Move the package with `git mv packages/rw-crm-components-engineer packages/rw-crm`, update only root-relative package metadata and validator paths, and keep all existing source behavior unchanged.**
- [ ] **Step 4: Run `node --test packages/rw-crm/test/package-migration.test.mjs && npm --prefix packages/rw-crm run validate`; expect PASS with the pre-existing 23 validations still green.**
- [ ] **Step 5: Commit:**

  ```bash
  git add -A packages/rw-crm packages/rw-crm-components-engineer
  git commit -m "refactor: move components agent into rw-crm package"
  ```

### Task 2: Extract shared contracts, context, conventions, ledger, and approval interfaces

**Files:**
- Modify: `packages/rw-crm/src/contracts.mjs`
- Modify: `packages/rw-crm/src/context/context-map.mjs`
- Modify: `packages/rw-crm/src/ledger/learning-ledger.mjs`
- Modify: `packages/rw-crm/src/workflow/approval-gate.mjs`
- Modify: `packages/rw-crm/schemas/context-envelope.schema.json`
- Create: `packages/rw-crm/schemas/initial-plan.schema.json`
- Create: `packages/rw-crm/schemas/plan-review.schema.json`
- Create: `packages/rw-crm/schemas/ui-review.schema.json`
- Create: `packages/rw-crm/schemas/model-proposal.schema.json`
- Modify: `packages/rw-crm/references/rw-conventions.md`
- Create: `packages/rw-crm/references/review-checklist.md`
- Create: `packages/rw-crm/test/shared-contracts.test.mjs`

**Interfaces:**
- `validateContextEnvelope`, `validateInitialPlan`, `validatePlanReview`, `validateEngineerResult`, `validateUiReview`, and `validateModelProposal` return `{ valid, errors }`.
- `discoverConfluenceTree(rootId, listChildren)` returns `{ pages, gaps }` and recursively includes all descendants.
- `proposeLearningEntry`, `approveLearningEntry`, and `rejectLearningEntry` preserve the existing ledger semantics.
- `createApprovalState`, `approvePlan`, `approveCodeEdits`, and `assertImplementationAuthorized` preserve the dual approval gate.

- [ ] **Step 1: Write failing tests for all new schema shapes, shared validators, recursive conventions source metadata, and preserved ledger/approval behavior.** Assert the full Confluence subtree rule and library-authoritative decision fields.
- [ ] **Step 2: Run `node --test packages/rw-crm/test/shared-contracts.test.mjs`; expect FAIL for missing schemas/validators.**
- [ ] **Step 3: Add the schemas and validators; extract reusable review criteria into `references/review-checklist.md` without changing existing behavior.**
- [ ] **Step 4: Run `node --test packages/rw-crm/test/shared-contracts.test.mjs packages/rw-crm/test/contracts.test.mjs packages/rw-crm/test/context-map.test.mjs packages/rw-crm/test/learning-ledger.test.mjs packages/rw-crm/test/approval-gate.test.mjs`; expect PASS.**
- [ ] **Step 5: Commit with `git add packages/rw-crm && git commit -m "refactor: extract shared RW CRM contracts"`.**

### Task 3: Add dynamic model routing and explicit confirmation

**Files:**
- Create: `packages/rw-crm/src/routing/model-router.mjs`
- Create: `packages/rw-crm/references/model-policy.md`
- Create: `packages/rw-crm/test/model-router.test.mjs`
- Modify: `packages/rw-crm/schemas/model-proposal.schema.json`

**Interfaces:**
- `classifyTask(request, contextSummary)` returns `{ tier: 'luna' | 'terra' | 'sol', reasons: string[], escalationTriggers: string[] }`.
- `proposeModelExecution(request, classification, defaults)` returns `{ proposalId, tier, assignments, reasons, status: 'awaiting-confirmation' }`.
- `approveModelExecution(proposal, { proposalId, assignments, approvedBy, approvedAt })` returns `{ ...proposal, status: 'approved' }` and rejects missing or mismatched assignments.
- `requestModelEscalation(current, target, reason)` returns `{ escalationId, from, to, reason, status: 'awaiting-confirmation' }` and never changes the active model by itself.

Default assignments are Planner Sol/high, Plan Reviewer Terra/high, Engineer Sol/high, UI Reviewer Terra/high, and Orchestrator Luna/medium. Simple tasks route to Luna, standard tasks to Terra, and complex or ambiguous tasks to Sol.

- [ ] **Step 1: Write failing tests for simple/standard/complex classification, accept-all approval, per-agent override, rejection, and escalation remaining pending until confirmed.**
- [ ] **Step 2: Run `node --test packages/rw-crm/test/model-router.test.mjs`; expect FAIL because routing functions are absent.**
- [ ] **Step 3: Implement the pure classifier and confirmation state transitions; use stable model IDs `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`, while allowing caller overrides.**
- [ ] **Step 4: Run the focused model tests; expect PASS and prove no higher-tier selection occurs without an approval record.**
- [ ] **Step 5: Commit with `git add packages/rw-crm && git commit -m "feat: add dynamic model routing and confirmation"`.**

### Task 4: Add the Components Planner subagent

**Files:**
- Create: `packages/rw-crm/agents/rw-crm-components-planner.yaml`
- Create: `packages/rw-crm/skills/rw-crm-components-planner/SKILL.md`
- Create: `packages/rw-crm/src/planning/components-planner.mjs`
- Create: `packages/rw-crm/test/components-planner.test.mjs`
- Create: `packages/rw-crm/test/fixtures/planner-task.json`

**Interfaces:**
- `createInitialPlan(request, { contextAdapter, ledger })` returns `{ context, plan, proposedLearningEntry }`.
- `plan` contains `id`, `goal`, `scope`, `files`, `interfaces`, `risks`, `verification`, `libraryDecisions`, and `approvalStatus: 'awaiting-approval'`.
- The Planner never returns `approvalStatus: 'approved'` and never calls an implementation adapter.

- [ ] **Step 1: Write failing tests proving the Planner retrieves context, consults the ledger, creates a bounded initial plan, reports ambiguity, and never writes.**
- [ ] **Step 2: Run `node --test packages/rw-crm/test/components-planner.test.mjs`; expect FAIL because the Planner module/profile are absent.**
- [ ] **Step 3: Implement the Planner boundary and read-only profile/skill using the shared context and plan schemas.**
- [ ] **Step 4: Run the focused Planner test; expect PASS with an initial plan and no implementation calls.**
- [ ] **Step 5: Commit with `git add packages/rw-crm && git commit -m "feat: add RW CRM Components Planner"`.**

### Task 5: Add the standalone Plan Reviewer subagent

**Files:**
- Create: `packages/rw-crm/agents/rw-crm-plan-reviewer.yaml`
- Create: `packages/rw-crm/skills/rw-crm-plan-reviewer/SKILL.md`
- Create: `packages/rw-crm/src/planning/plan-reviewer.mjs`
- Create: `packages/rw-crm/test/plan-reviewer.test.mjs`
- Create: `packages/rw-crm/test/fixtures/plan-review.json`
- Modify: `packages/rw-crm/references/review-checklist.md`

**Interfaces:**
- `reviewPlan({ request, initialPlan }, { contextAdapter, checklist, ledger })` returns `{ findings, reviewedPlan, recommendation: 'approve' | 'revise' | 'blocked', proposedLearningEntry }`.
- Findings contain `{ id, severity: 'critical' | 'high' | 'medium' | 'low', category, message, evidence, blocking }`.
- The Plan Reviewer never edits the initial plan or code.

- [ ] **Step 1: Write failing tests for complete-plan approval, missing-context block, Figma/library conflict finding, incomplete verification finding, and read-only behavior.**
- [ ] **Step 2: Run `node --test packages/rw-crm/test/plan-reviewer.test.mjs`; expect FAIL because the reviewer is absent.**
- [ ] **Step 3: Implement checklist-driven plan review and the standalone profile/skill. Keep it separate from the plugin’s brainstorming review mode.**
- [ ] **Step 4: Run the focused Plan Reviewer test; expect PASS with recommendation and blocking severity matching the findings.**
- [ ] **Step 5: Commit with `git add packages/rw-crm && git commit -m "feat: add RW CRM Plan Reviewer"`.**

### Task 6: Refactor the Components Engineer to consume approved plans

**Files:**
- Modify: `packages/rw-crm/agents/rw-crm-components-engineer.yaml`
- Modify: `packages/rw-crm/skills/rw-crm-components-engineer/SKILL.md`
- Modify: `packages/rw-crm/src/workflow/engineer-workflow.mjs`
- Modify: `packages/rw-crm/test/engineer-workflow.test.mjs`
- Modify: `packages/rw-crm/test/package-contract.test.mjs`

**Interfaces:**
- `runEngineerWorkflow({ request, approvedPlan }, deps)` rejects plans without a matching approved plan record.
- It returns `awaiting-edit-approval` after presenting `{ planId, editSetHash, edits }` and returns `implemented` only after matching plan and edit approvals.
- Existing component creation, bug-fix, feature-extension, ledger, and verification semantics remain intact.

- [ ] **Step 1: Add failing tests showing an unapproved initial plan is rejected, a reviewed/approved plan is accepted, edit-set approval is still required, and scope drift invalidates approval.**
- [ ] **Step 2: Run `node --test packages/rw-crm/test/engineer-workflow.test.mjs`; expect FAIL because the current workflow does not consume an approved-plan envelope.**
- [ ] **Step 3: Refactor the workflow and profile/skill to remove plan creation responsibility while retaining lightweight plan/context validation and both approval gates.**
- [ ] **Step 4: Run the focused Engineer tests plus the existing scenario tests; expect PASS for new component, bug fix, feature extension, conflict, and learning behavior.**
- [ ] **Step 5: Commit with `git add packages/rw-crm && git commit -m "refactor: make engineer consume approved plans"`.**

### Task 7: Add the post-implementation UI Reviewer

**Files:**
- Create: `packages/rw-crm/agents/rw-crm-ui-reviewer.yaml`
- Create: `packages/rw-crm/skills/rw-crm-ui-reviewer/SKILL.md`
- Create: `packages/rw-crm/src/review/ui-reviewer.mjs`
- Create: `packages/rw-crm/test/ui-reviewer.test.mjs`
- Create: `packages/rw-crm/test/fixtures/ui-review.json`

**Interfaces:**
- `reviewImplementation({ request, approvedPlan, changedArtifacts }, { contextAdapter, evidenceAdapter, checklist })` returns `{ findings, verification, completion: 'pass' | 'blocked' | 'pass-with-findings', proposedLearningEntry }`.
- Critical findings have `blocking: true`; medium/low findings do not block completion.
- The Reviewer runs for every Engineer task and never calls a write-capable adapter.

- [ ] **Step 1: Write failing tests for clean completion, critical finding blocking, non-critical report-only findings, Figma/library conflict reporting, and non-visual code review.**
- [ ] **Step 2: Run `node --test packages/rw-crm/test/ui-reviewer.test.mjs`; expect FAIL because the UI Reviewer is absent.**
- [ ] **Step 3: Implement read-only review aggregation, severity/blocking rules, and profile/skill using shared context and review criteria.**
- [ ] **Step 4: Run the focused UI Reviewer tests; expect PASS with critical findings blocking and lower-severity findings report-only.**
- [ ] **Step 5: Commit with `git add packages/rw-crm && git commit -m "feat: add RW CRM UI Reviewer"`.**

### Task 8: Add UI routing and the optional Workflow Orchestrator

**Files:**
- Create: `packages/rw-crm/agents/rw-crm-workflow.yaml`
- Create: `packages/rw-crm/skills/rw-crm-workflow/SKILL.md`
- Create: `packages/rw-crm/src/routing/ui-task-router.mjs`
- Create: `packages/rw-crm/src/workflow/rw-crm-orchestrator.mjs`
- Create: `packages/rw-crm/test/ui-task-router.test.mjs`
- Create: `packages/rw-crm/test/rw-crm-orchestrator.test.mjs`
- Create: `packages/rw-crm/test/fixtures/orchestration.json`

**Interfaces:**
- `routeUiTask({ task, explicitInvocation, figmaLinks, componentScope })` returns `{ invoke: boolean, reason, confidence }`; explicit invocation always returns `invoke: true`.
- `runRwCrmOrchestrator(request, deps)` returns `{ routing, modelProposal, planner, planReview, planApproval, engineer, uiReview, status }`.
- In `environment: 'standalone'`, the orchestrator invokes Planner then Plan Reviewer; in `environment: 'create-task-plan-plugin'`, it invokes Planner and returns control to the plugin for brainstorming review without invoking Plan Reviewer.
- The orchestrator pauses for model confirmation, plan approval, code-edit approval, model escalation, and critical UI findings.

- [ ] **Step 1: Write failing tests for UI routing, explicit override, non-UI skip, standalone flow, plugin flow without duplicate Plan Reviewer, model proposal confirmation, and mandatory post-Engineer UI review.**
- [ ] **Step 2: Run `node --test packages/rw-crm/test/ui-task-router.test.mjs packages/rw-crm/test/rw-crm-orchestrator.test.mjs`; expect FAIL because routing/orchestration modules are absent.**
- [ ] **Step 3: Implement routing and orchestration with dependency injection for subagent functions and model confirmation callbacks.**
- [ ] **Step 4: Run the focused routing/orchestration tests; expect PASS and prove no subagent is invoked before model approval or no Engineer write occurs before both implementation approvals.**
- [ ] **Step 5: Commit with `git add packages/rw-crm && git commit -m "feat: add RW CRM routing and orchestrator"`.**

### Task 9: Update package profiles, skills, consumer docs, and full validation

**Files:**
- Modify: `packages/rw-crm/.codex-plugin/plugin.json`
- Modify: `packages/rw-crm/package.json`
- Modify: `packages/rw-crm/scripts/validate-package.mjs`
- Modify: `packages/rw-crm/references/create-task-plan-consumer-contract.md`
- Modify: `packages/rw-crm/references/model-policy.md`
- Create: `packages/rw-crm/test/profile-contract.test.mjs`
- Create: `packages/rw-crm/test/plugin-consumer-contract.test.mjs`
- Modify: `packages/rw-crm/test/validation-scenarios.test.mjs`
- Create: `packages/rw-crm/test/fixtures/plugin-flow.json`
- Create: `packages/rw-crm/test/fixtures/model-escalation.json`

**Interfaces:**
- Manifest exports all five profiles and five skills while preserving technical IDs.
- `npm run test:unit`, `npm run test:scenarios`, `npm run test:contract`, and `npm run validate` are the package entry points.
- The plugin consumer contract documents task-context input, initial-plan output, delegated brainstorming review, final approval handoff, and no plugin-source modification.

- [ ] **Step 1: Write failing profile/consumer tests for all five profiles, all routing triggers, read-only/write permissions, model policy text, plugin delegation, and no duplicate Plan Reviewer invocation.**
- [ ] **Step 2: Run `node --test packages/rw-crm/test/profile-contract.test.mjs packages/rw-crm/test/plugin-consumer-contract.test.mjs`; expect FAIL for incomplete manifest/docs.**
- [ ] **Step 3: Update manifests, package scripts, validator, consumer contract, model policy, and scenario fixtures; keep the plugin source outside the package unchanged.**
- [ ] **Step 4: Set scripts exactly:**

  ```json
  {
    "test": "npm run test:unit && npm run test:scenarios && npm run test:contract",
    "test:unit": "node --test test/contracts.test.mjs test/context-map.test.mjs test/learning-ledger.test.mjs test/approval-gate.test.mjs test/model-router.test.mjs test/components-planner.test.mjs test/plan-reviewer.test.mjs test/engineer-workflow.test.mjs test/ui-reviewer.test.mjs test/ui-task-router.test.mjs test/rw-crm-orchestrator.test.mjs",
    "test:scenarios": "node --test test/validation-scenarios.test.mjs",
    "test:contract": "node --test test/package-migration.test.mjs test/package-contract.test.mjs test/profile-contract.test.mjs test/plugin-consumer-contract.test.mjs",
    "validate": "npm run test && node scripts/validate-package.mjs"
  }
  ```
- [ ] **Step 5: Run the full suite from the repository root:**

  ```bash
  npm --prefix packages/rw-crm run validate
  git diff --check
  ```

  Expected: every unit, scenario, and contract test passes; validator prints `RW CRM package contract: PASS`; both commands exit `0`; the existing Create Task Plan plugin has no source diff.
- [ ] **Step 6: Commit with `git add -A packages/rw-crm packages/rw-crm-components-engineer && git commit -m "feat: complete RW CRM multi-agent package"`.**

## Accepted Validation Scenarios

The final scenario suite must include:

1. **Simple task:** Luna classification, model proposal accepted, Planner/Engineer/Reviewer use approved assignments, and no escalation occurs.
2. **Standard bug fix:** Terra classification, standalone Planner → Plan Reviewer → approvals → Engineer → UI Reviewer flow completes.
3. **New component:** Sol classification, plan review identifies component boundaries and verification, Engineer writes only after both approvals.
4. **Figma/library conflict:** all relevant agents report the conflict and preserve the UI-library-authoritative decision.
5. **Plugin UI task:** plugin routing invokes Planner, delegates plan review to brainstorming, skips package Plan Reviewer, and receives the structured initial plan.
6. **Non-UI task:** automatic routing skips the package; explicit invocation overrides the skip.
7. **Model escalation:** a subagent requests a higher tier, execution pauses, and no escalation occurs until the user confirms.
8. **Critical UI finding:** UI Reviewer blocks completion; lower-severity findings produce `pass-with-findings`.
9. **Learning correction:** each subagent can propose a stable rule or task exception, but only user approval persists it.

## Final Self-Review Checklist

Before claiming the implementation complete, verify:

- the package is at `packages/rw-crm/` and the old package root is absent;
- all five profiles and skills are independently callable;
- the Planner creates initial plans but never writes;
- the Plan Reviewer is used only outside plugin mode;
- the Engineer consumes approved plans and preserves both approvals;
- the UI Reviewer runs after every Engineer task and blocks only on critical findings;
- the plugin routes only UI tasks automatically and explicit invocation overrides routing;
- the model proposal appears before orchestration and every escalation requires confirmation;
- shared context includes recursive Confluence descendants and reports gaps;
- Figma conflicts always preserve UI-library authority;
- learning persistence requires approval and keeps stable rules separate from exceptions;
- no existing Create Task Plan plugin source files changed;
- `npm --prefix packages/rw-crm run validate` passes; and
- `git diff --check` passes.
