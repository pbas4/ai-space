# RW CRM High-Priority Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RW CRM’s four high-priority safety and integration promises executable: approved model assignments control worker calls, the complete Confluence conventions subtree is indexed per task, UI routing has one evidence-based policy, and plan/edit approvals are bound to exact content.

**Architecture:** Keep `packages/rw-crm` independently usable and dependency-free at runtime by adding pure contracts plus injected adapters. The optional orchestrator owns model and approval state; a task-scoped Confluence adapter produces indexed source metadata and fetches only relevant page bodies. Create Task Plan remains a consumer, using the same routing-policy contract in its skill instructions without taking ownership of RW CRM logic.

**Tech Stack:** Node.js ESM; Node built-in `node:test` and `node:assert/strict`; Node `node:crypto` for SHA-256 digests; JSON Schema Draft 2020-12; Markdown/YAML Codex plugin profiles and skills; Python `unittest` for Create Task Plan contract tests. No third-party dependencies and no Nx commands.

## Global Constraints

- Work only in `packages/rw-crm/`, `packages/rw-create-task-plan/`, and the two documentation files created by this plan.
- Preserve independent invocation of every RW CRM profile and keep Create Task Plan a consumer, not a dependency owner.
- Do not use Figma, Confluence, Jira, or Git write tools during package logic; adapters supply read-only evidence at runtime.
- Keep the full conventions subtree rooted at Confluence page `21790813` indexed per task. Fetch bodies only for the selected relevant pages and report inaccessible or stale sources.
- Preserve UI-library authority over conflicting Figma direction and include the decision in structured context.
- Require an explicit model confirmation before any worker invocation; every worker must receive its approved assignment.
- Require an explicit plan receipt and a concrete edit-set receipt before code edits. Any plan or edit-manifest change invalidates prior approval.
- Use direct Jest commands only for target-repository verification; never add Nx-based verification guidance.
- Preserve the PR Description Writer’s fixed `gpt-5.6-luna` / light assignment.
- Use TDD for each behavior change: add a failing focused test, observe its failure, implement the minimum change, rerun focused tests, then run the full affected package suite.
- Do not commit, push, or install a plugin unless separately authorized by the user.

---

## Target File Map and Boundaries

- `packages/rw-crm/src/routing/model-router.mjs` — model presets, individual-assignment validation, and escalation proposal/approval transitions.
- `packages/rw-crm/src/workflow/rw-crm-orchestrator.mjs` — translates approved model selections into worker execution context; blocks progression on unresolved escalation.
- `packages/rw-crm/src/workflow/worker-execution.mjs` — new, focused builder for immutable role-specific execution context.
- `packages/rw-crm/src/context/context-map.mjs` — indexes all Confluence page metadata and selects sources by evidence rather than treating every Confluence page as a body source.
- `packages/rw-crm/src/context/confluence-context-adapter.mjs` — new injected read-only adapter that traverses descendants, builds page sources, retrieves only selected bodies, and records gaps.
- `packages/rw-crm/src/routing/ui-task-router.mjs` — pure evidence classifier shared by standalone and plugin-consumer contract.
- `packages/rw-crm/src/workflow/approval-gate.mjs` — canonical JSON digesting, receipt creation, receipt validation, and state transitions.
- `packages/rw-crm/src/workflow/engineer-workflow.mjs` — requires receipts from `request.approvals`; never trusts an approval object embedded in a plan.
- `packages/rw-crm/src/contracts.mjs` and `packages/rw-crm/schemas/*.json` — align structured contracts with the stricter runtime invariants.
- `packages/rw-crm/skills/*/SKILL.md` and `packages/rw-crm/references/*.md` — document exact runtime behaviors and the common routing/approval contract.
- `packages/rw-create-task-plan/skills/create-task-plan/SKILL.md` — consumes the shared policy result; auto-routes only definite UI work and asks one confirmation for `possible-ui` work.
- `packages/rw-create-task-plan/tests/test_skill_contract.py` — verifies consumer instructions reference the common policy and preserve non-UI safety.
- `packages/rw-crm/test/*.test.mjs` — focused behavioral, contract, and orchestration tests.

## Shared Interfaces

All new interfaces are JSON-serializable.

```js
// src/workflow/worker-execution.mjs
export const WORKER_ROLES = ['planner', 'planReviewer', 'engineer', 'uiReviewer', 'prWriter'];
export function createWorkerExecution({ proposalId, role, assignment, approvedAt, escalation = null }) {}

// src/routing/model-router.mjs
export function proposeModelExecution(request, classification, defaults, preset) {}
export function approveModelExecution(proposal, approval) {}
export function approveModelEscalation(current, escalation, approval) {}

// src/context/confluence-context-adapter.mjs
export function createConfluenceContextAdapter({ rootId, listChildren, fetchPage }) {}
// adapter.discover(envelope) -> Promise<{ index, selectedSources, gaps, ambiguities }>

// src/routing/ui-task-router.mjs
export function classifyUiTask(input) {}
// -> { classification: 'ui-related' | 'possible-ui' | 'non-ui', evidence, confidence }
export function routeUiTask(input, { threshold = 'possible-ui' } = {}) {}

// src/workflow/approval-gate.mjs
export function createPlanDigest(plan) {}
export function createEditSetDigest(planId, edits) {}
export function approvePlan(state, receipt) {}
export function approveCodeEdits(state, receipt) {}
```

An approved plan receipt is:

```js
{ planId, planHash, approvedBy, approvedAt }
```

An approved code-edit receipt is:

```js
{ planId, planHash, editSetHash, approvedBy, approvedAt }
```

The orchestrator calls workers with the existing input plus a second immutable execution argument:

```js
deps.planner(request, execution);
deps.planReviewer({ request, initialPlan }, execution);
deps.engineer({ request, approvedPlan }, execution);
deps.uiReviewer({ request, approvedPlan, changedArtifacts }, execution);
deps.prWriter(payload, execution);
```

This preserves current dependency injection while making the selected model observable and enforceable.

---

### Task 1: Turn model selection into worker execution context

**Files:**

- Create: `packages/rw-crm/src/workflow/worker-execution.mjs`
- Modify: `packages/rw-crm/src/routing/model-router.mjs`
- Modify: `packages/rw-crm/src/workflow/rw-crm-orchestrator.mjs`
- Modify: `packages/rw-crm/src/contracts.mjs`
- Modify: `packages/rw-crm/schemas/model-proposal.schema.json`
- Modify: `packages/rw-crm/references/model-policy.md`
- Modify: `packages/rw-crm/skills/rw-crm-workflow/SKILL.md`
- Modify: `packages/rw-crm/test/model-router.test.mjs`
- Modify: `packages/rw-crm/test/rw-crm-orchestrator.test.mjs`
- Modify: `packages/rw-crm/test/shared-contracts.test.mjs`

**Interfaces:**

- Consumes `request.modelSelection?.preset`, `request.modelApproval`, and optional `request.modelEscalationApproval`.
- Produces one immutable `execution` value per worker with `{ proposalId, role, model, reasoning, approvedAt, escalation }`.
- `approveModelExecution` accepts exactly the six model-assignment roles (`planner`, `planReviewer`, `engineer`, `uiReviewer`, `prWriter`, and `orchestrator`) when `acceptAll` is false; it rejects missing, extra, unsupported-model, unsupported-reasoning, and altered PR Writer assignments.
- A worker may return `{ modelEscalation: { target, reason } }`; the orchestrator returns `awaiting-model-escalation` until a matching confirmed escalation is supplied.

- [ ] **Step 1: Add failing model-router tests.**

  In `packages/rw-crm/test/model-router.test.mjs`, add tests that:

  ```js
  test('uses the selected preset rather than always proposing recommended', () => {
    const proposal = proposeModelExecution(
      { task: 'Fix Button', modelSelection: { preset: 'light' } },
      { tier: 'terra', reasons: ['standard'], escalationTriggers: [] },
      undefined,
      'light'
    );
    assert.equal(proposal.preset, 'light');
    assert.deepEqual(proposal.assignments.engineer, { model: 'gpt-5.6-luna', reasoning: 'medium' });
  });

  test('rejects individual approvals with a missing or extra worker role', () => {
    const proposal = proposeModelExecution({ task: 'Fix Button' }, classification);
    const missing = { ...proposal.assignments };
    delete missing.uiReviewer;
    assert.throws(() => approveModelExecution(proposal, { proposalId: proposal.proposalId, assignments: missing }), /roles/);
  });
  ```

- [ ] **Step 2: Add a failing orchestrator propagation/escalation test.**

  Update dependency spies in `packages/rw-crm/test/rw-crm-orchestrator.test.mjs` to record the second argument and assert:

  ```js
  assert.deepEqual(calls[0].execution, {
    proposalId: 'model:Fix Button',
    role: 'planner',
    model: 'gpt-5.6-luna',
    reasoning: 'high',
    approvedAt: 'now',
    escalation: null
  });
  ```

  Add a worker fixture that returns `{ modelEscalation: { target: 'sol', reason: 'new Figma conflict' } }` and assert that the next worker is not invoked and `status === 'awaiting-model-escalation'`.

- [ ] **Step 3: Run focused tests and confirm the expected failures.**

  Run:

  ```bash
  node --test test/model-router.test.mjs test/rw-crm-orchestrator.test.mjs
  ```

  from `packages/rw-crm/`.

  Expected: FAIL because the request preset is ignored, worker calls have no execution argument, and escalation is not a workflow state.

- [ ] **Step 4: Implement strict assignment and execution helpers.**

  Create `src/workflow/worker-execution.mjs` with a frozen execution object and a fixed role list. In `model-router.mjs`:

  - set `preset` from the explicit fourth argument or `request.modelSelection?.preset ?? 'recommended'`;
  - validate the exact role-key set before accepting individual assignments;
  - allow only `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` with `light`, `medium`, or `high` reasoning;
  - preserve the PR Writer’s `gpt-5.6-luna` / `light` exception;
  - add `approveModelEscalation`, which requires the matching escalation ID and an explicitly confirmed full assignment set.

  In `rw-crm-orchestrator.mjs`, pass `createWorkerExecution(...)` as the second argument to each worker. Check a completed worker result for `modelEscalation` before calling the next worker. Do not continue until `approveModelEscalation` succeeds.

- [ ] **Step 5: Align contracts and human instructions.**

  Expand `model-proposal.schema.json` and `validateModelProposal` so the runtime and schema require an assignment for every role, allowed models/reasoning, selection options, and approval status. Update the model policy and workflow skill to state that the displayed choice is also the exact worker execution assignment.

- [ ] **Step 6: Run focused tests and confirm success.**

  Run:

  ```bash
  node --test test/model-router.test.mjs test/rw-crm-orchestrator.test.mjs test/shared-contracts.test.mjs
  ```

  Expected: PASS. The tests show that a selected preset reaches each worker, an invalid individual assignment is rejected, and escalation cannot silently advance the workflow.

### Task 2: Add task-scoped Confluence subtree indexing and on-demand body retrieval

**Files:**

- Create: `packages/rw-crm/src/context/confluence-context-adapter.mjs`
- Modify: `packages/rw-crm/src/context/context-map.mjs`
- Modify: `packages/rw-crm/src/adapters/README.md`
- Modify: `packages/rw-crm/references/rw-conventions.md`
- Modify: `packages/rw-crm/skills/rw-crm-components-planner/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-components-engineer/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-plan-reviewer/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-ui-reviewer/SKILL.md`
- Modify: `packages/rw-crm/test/context-map.test.mjs`
- Create: `packages/rw-crm/test/confluence-context-adapter.test.mjs`
- Modify: `packages/rw-crm/test/package-contract.test.mjs`

**Interfaces:**

- `createConfluenceContextAdapter({ rootId, listChildren, fetchPage })` defaults `rootId` to `'21790813'`.
- `listChildren(pageId)` returns page metadata with at least `id`, `title`, optional `uri`, `tags`, `updatedAt`, and optional `inaccessible`.
- `adapter.discover(envelope)` returns `{ index, selectedSources, gaps, ambiguities }`; `index` contains metadata for root plus every reachable descendant, while `selectedSources` contains only relevant pages whose bodies were successfully fetched.
- Failed child-listing and page-fetching operations add structured gaps and never erase already discovered pages.

- [ ] **Step 1: Add failing source-index tests.**

  Extend `packages/rw-crm/test/context-map.test.mjs` so `buildSourceIndex` accepts `confluence: [...]` and verifies all supplied descendants are represented as `kind: 'confluence'`. Replace the existing expectation that every Confluence source is automatically selected with assertions that a matching descendant is selected by tag/title and the root is retained only as a convention fallback.

- [ ] **Step 2: Add failing adapter tests.**

  Create `packages/rw-crm/test/confluence-context-adapter.test.mjs` with a nested fixture:

  ```js
  const children = {
    '21790813': [{ id: 'forms', title: 'Forms', tags: ['Form'] }],
    forms: [{ id: 'datepicker', title: 'DatePicker conventions', tags: ['DatePicker'] }],
    datepicker: []
  };
  ```

  Assert that `adapter.discover({ componentScope: ['DatePicker'] })` indexes all three pages, calls `fetchPage` only for `datepicker` and any required root fallback, and returns the fetched page body as a selected source. Add cases for an inaccessible descendant and a `listChildren` rejection; both must return a gap rather than reject the whole discovery.

- [ ] **Step 3: Run focused tests and confirm the expected failures.**

  Run:

  ```bash
  node --test test/context-map.test.mjs test/confluence-context-adapter.test.mjs
  ```

  from `packages/rw-crm/`.

  Expected: FAIL because the adapter does not exist and the index only supports `confluenceRoot`.

- [ ] **Step 4: Implement metadata-first indexing.**

  In `context-map.mjs`:

  - replace the singular `confluenceRoot` input with `confluence = []`, while supporting `confluenceRoot` as a deprecated compatibility input;
  - normalize page metadata to `{ id, uri, title, tags, freshness, refreshPolicy: 'on-demand', kind: 'confluence' }`;
  - select Confluence sources only when page title/tags match scope or when no page matches and the root fallback is required;
  - make `discoverConfluenceTree` catch failures per parent and append `{ sourceId: parentId, reason: 'child-discovery-failed', impact }`.

  Create `confluence-context-adapter.mjs` to call `discoverConfluenceTree`, build the complete metadata index, select relevant pages, fetch only those bodies, mark fetched sources fresh, and append `refresh-failed` gaps for unavailable bodies.

- [ ] **Step 5: Document the adapter boundary and all-subpage guarantee.**

  Update `src/adapters/README.md` with the exact `listChildren`/`fetchPage` contract. Update `rw-conventions.md` and each role skill to say the complete subtree is **indexed per task**, relevant descendants are **retrieved on demand**, and missing pages are **reported with impact**. Do not describe any permanent full-page memory.

- [ ] **Step 6: Run focused tests and confirm success.**

  Run:

  ```bash
  node --test test/context-map.test.mjs test/confluence-context-adapter.test.mjs test/package-contract.test.mjs
  ```

  Expected: PASS. The tests prove nested descendants are indexed, only relevant bodies are fetched, and partial Confluence failures remain visible as gaps.

### Task 3: Unify UI classification while preserving safe plugin routing

**Files:**

- Modify: `packages/rw-crm/src/routing/ui-task-router.mjs`
- Modify: `packages/rw-crm/src/workflow/rw-crm-orchestrator.mjs`
- Create: `packages/rw-crm/references/ui-task-routing-policy.md`
- Modify: `packages/rw-crm/references/create-task-plan-consumer-contract.md`
- Modify: `packages/rw-crm/skills/rw-crm-workflow/SKILL.md`
- Modify: `packages/rw-crm/test/ui-task-router.test.mjs`
- Modify: `packages/rw-crm/test/rw-crm-orchestrator.test.mjs`
- Modify: `packages/rw-create-task-plan/skills/create-task-plan/SKILL.md`
- Modify: `packages/rw-create-task-plan/tests/test_skill_contract.py`
- Modify: `packages/rw-create-task-plan/README.md`

**Interfaces:**

- `classifyUiTask(input)` returns the shared classification, evidence entries, and `high | medium` confidence.
- Definite UI evidence is a Figma/design reference, non-empty component scope, an explicit RW CRM UI-library/component-library reference, or explicit invocation.
- Generic visual/frontend terms without definite evidence produce `possible-ui` with medium confidence.
- The standalone RW CRM workflow calls `routeUiTask(input, { threshold: 'possible-ui' })`; Create Task Plan only auto-invokes for `ui-related`. For `possible-ui`, it asks the user once whether to invoke the Planner and records the answer.

- [ ] **Step 1: Write failing shared-classifier tests.**

  Replace the single boolean-routing assertions in `packages/rw-crm/test/ui-task-router.test.mjs` with:

  ```js
  assert.equal(classifyUiTask({ task: 'Improve screen spacing' }).classification, 'possible-ui');
  assert.equal(classifyUiTask({ task: 'Fix DatePicker', componentScope: ['DatePicker'] }).classification, 'ui-related');
  assert.equal(classifyUiTask({ task: 'Add database index' }).classification, 'non-ui');
  assert.equal(classifyUiTask({ task: 'Add database index', explicitInvocation: true }).classification, 'ui-related');
  ```

  Assert that `routeUiTask(..., { threshold: 'ui-related' })` skips a `possible-ui` task while the standalone threshold invokes it.

- [ ] **Step 2: Add failing plugin consumer-contract tests.**

  In `packages/rw-create-task-plan/tests/test_skill_contract.py`, add assertions that the skill names `ui-related`, `possible-ui`, `non-ui`, records classification evidence, auto-invokes only `ui-related`, and asks one explicit confirmation for `possible-ui` before the Planner is invoked.

- [ ] **Step 3: Run focused tests and confirm the expected failures.**

  Run:

  ```bash
  node --test test/ui-task-router.test.mjs test/rw-crm-orchestrator.test.mjs
  ```

  from `packages/rw-crm/`, then run:

  ```bash
  python3 -m unittest discover -s tests -p 'test_skill_contract.py' -v
  ```

  from `packages/rw-create-task-plan/`.

  Expected: FAIL because the current router has only `invoke: boolean` and the plugin has no `possible-ui` decision path.

- [ ] **Step 4: Implement one evidence-producing classifier.**

  In `ui-task-router.mjs`, add `classifyUiTask` and have `routeUiTask` map its result to `invoke`, `reason`, `confidence`, and `evidence` based on a threshold. Ensure the orchestrator returns the richer routing record unchanged.

  Add `references/ui-task-routing-policy.md` with the exact evidence table and threshold behavior. Update the consumer contract to require that the plugin send the classifier’s evidence and chosen threshold into the Planner request.

- [ ] **Step 5: Update Create Task Plan’s consumer instructions.**

  Replace the hard-coded binary classification paragraph with the three outcomes above. For `possible-ui`, use the existing structured-choice convention to ask exactly one question: whether to invoke RW CRM planning, continue as non-UI, or cancel planning. Do not inspect Figma unless the existing Figma-consent gate is separately approved.

- [ ] **Step 6: Run focused tests and confirm success.**

  Run:

  ```bash
  node --test test/ui-task-router.test.mjs test/rw-crm-orchestrator.test.mjs
  ```

  from `packages/rw-crm/`, then:

  ```bash
  python3 -m unittest discover -s tests -v
  ```

  from `packages/rw-create-task-plan/`.

  Expected: PASS. The same generic frontend task has the same classification and evidence everywhere; only the documented entry-point threshold differs.

### Task 4: Bind implementation approvals to canonical plan and edit manifests

**Files:**

- Modify: `packages/rw-crm/src/workflow/approval-gate.mjs`
- Modify: `packages/rw-crm/src/workflow/engineer-workflow.mjs`
- Modify: `packages/rw-crm/src/workflow/rw-crm-orchestrator.mjs`
- Modify: `packages/rw-crm/src/contracts.mjs`
- Modify: `packages/rw-crm/schemas/context-envelope.schema.json`
- Modify: `packages/rw-crm/schemas/initial-plan.schema.json`
- Create: `packages/rw-crm/schemas/approval-receipt.schema.json`
- Modify: `packages/rw-crm/references/workflow.md`
- Modify: `packages/rw-crm/skills/rw-crm-components-engineer/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-workflow/SKILL.md`
- Modify: `packages/rw-crm/test/approval-gate.test.mjs`
- Modify: `packages/rw-crm/test/engineer-workflow.test.mjs`
- Modify: `packages/rw-crm/test/contracts.test.mjs`
- Modify: `packages/rw-crm/test/validation-scenarios.test.mjs`

**Interfaces:**

- `createPlanDigest(plan)` creates a SHA-256 hex digest from canonical JSON that excludes volatile approval fields.
- `createEditSetDigest(planId, edits)` creates a SHA-256 hex digest from the exact ordered edit manifest.
- `createApprovalState(plan)` stores `planId`, `planHash`, and no preapproved state.
- `approvePlan(state, receipt)` requires matching `planId` and `planHash` plus non-empty `approvedBy` and ISO-8601 `approvedAt`.
- `approveCodeEdits(state, receipt)` additionally requires matching `editSetHash`, `planHash`, and state that already accepted a valid plan receipt.
- `runEngineerWorkflow` reads both receipts from `request.approvals`; it must not read or trust `approvedPlan.approval`.

- [ ] **Step 1: Add failing approval-gate tests.**

  In `packages/rw-crm/test/approval-gate.test.mjs`, add tests that mutate a plan after its receipt was made and assert rejection:

  ```js
  const plan = { id: 'plan-1', files: ['Button.tsx'], verification: ['jest Button.test.tsx'] };
  const state = createApprovalState(plan);
  const receipt = { planId: 'plan-1', planHash: createPlanDigest(plan), approvedBy: 'Pol', approvedAt: '2026-08-26T10:00:00.000Z' };
  const changedPlan = { ...plan, files: ['Button.tsx', 'Button.stories.tsx'] };
  assert.throws(() => approvePlan(createApprovalState(changedPlan), receipt), /plan hash/);
  ```

  Add cases for missing approver, invalid timestamp, a code receipt missing `planHash`, and a code receipt for reordered edits.

- [ ] **Step 2: Add failing Engineer workflow tests.**

  Update `packages/rw-crm/test/engineer-workflow.test.mjs` so the successful call supplies both receipts in `request.approvals`. Add assertions that:

  - an embedded `approvedPlan.approval` without `request.approvals.plan` returns `awaiting-plan-approval`;
  - an invalid plan receipt prevents `implementationAdapter.propose` and `apply`;
  - an edit proposal whose manifest changes after code approval prevents `apply`.

- [ ] **Step 3: Run focused tests and confirm the expected failures.**

  Run:

  ```bash
  node --test test/approval-gate.test.mjs test/engineer-workflow.test.mjs test/contracts.test.mjs test/validation-scenarios.test.mjs
  ```

  from `packages/rw-crm/`.

  Expected: FAIL because approvals currently have no content digest and the Engineer trusts `approvedPlan.approval`.

- [ ] **Step 4: Implement canonical digests and receipt validation.**

  In `approval-gate.mjs`, implement a deterministic canonicalizer that recursively sorts object keys, preserves array order, and omits `approval` and `approvalReceipt` fields before hashing with `node:crypto` SHA-256. Derive the edit digest from `{ planId, edits }` after the implementation adapter produces the exact edit manifest.

  Change the state machine to receive the full plan object. Validate receipt fields before changing state. Include the accepted immutable receipts in the state only after validation.

  In `engineer-workflow.mjs`, require `approvedPlan.approvalStatus === 'approved'` **and** a valid `request.approvals.plan` receipt before creating an edit proposal. Require a valid `request.approvals.codeEdits` receipt before `implementationAdapter.apply`.

- [ ] **Step 5: Align JSON schemas, runtime contracts, and skills.**

  Add `approval-receipt.schema.json`, reference its required fields from the context envelope and initial-plan schema, and extend runtime validation accordingly. Update workflow and Engineer skills to explicitly show the plan ID/hash and edit-set hash that require user approval. Update `references/workflow.md` with the invalidation rules.

- [ ] **Step 6: Run focused tests and confirm success.**

  Run:

  ```bash
  node --test test/approval-gate.test.mjs test/engineer-workflow.test.mjs test/contracts.test.mjs test/validation-scenarios.test.mjs
  ```

  Expected: PASS. Tests prove that changing plan content, changing edit order/content, omitting a receipt, or reusing a receipt on another plan blocks any write.

### Task 5: Complete package contracts, regression coverage, and documentation validation

**Files:**

- Modify: `packages/rw-crm/scripts/validate-package.mjs`
- Modify: `packages/rw-crm/test/package-contract.test.mjs`
- Modify: `packages/rw-crm/test/plugin-consumer-contract.test.mjs`
- Modify: `packages/rw-crm/test/instruction-contract.test.mjs`
- Modify: `packages/rw-crm/README.md`
- Modify: `packages/rw-create-task-plan/README.md`
- Modify: `docs/superpowers/sources/2026-08-26-ai-space-package-audit.md`

**Interfaces:**

- Package validation requires `approval-receipt.schema.json`, `confluence-context-adapter.mjs`, `worker-execution.mjs`, and `ui-task-routing-policy.md`.
- Consumer contract tests verify the plugin uses the same three-way classifier policy and does not invoke implementation while planning.
- READMEs describe the observable behavior, not internal-only promises.

- [ ] **Step 1: Add failing package-validation and consumer-contract assertions.**

  Add expected required file paths to `scripts/validate-package.mjs`. In contract tests, assert that model assignments are passed to workers, Confluence descendants are indexed/on-demand, `possible-ui` has a confirmation path, and approval receipts bind both plan and edit content.

- [ ] **Step 2: Run focused contract tests and confirm expected failures.**

  Run:

  ```bash
  node --test test/package-contract.test.mjs test/plugin-consumer-contract.test.mjs test/instruction-contract.test.mjs
  ```

  from `packages/rw-crm/`, then:

  ```bash
  python3 -m unittest discover -s tests -v
  ```

  from `packages/rw-create-task-plan/`.

  Expected: FAIL until all prior tasks expose and document their contracts.

- [ ] **Step 3: Update validation and user documentation.**

  Require every new source/schema/reference in `validate-package.mjs`. Update both READMEs with:

  - the model-selection confirmation and exact propagation behavior;
  - indexed/on-demand Confluence conventions retrieval;
  - `ui-related` / `possible-ui` / `non-ui` routing behavior; and
  - content-bound plan and code-edit approval receipts.

  Mark audit findings 1–4 as implemented only after all validation in this task passes; retain findings 5–14 as deferred.

- [ ] **Step 4: Run the full RW CRM validation suite.**

  Run:

  ```bash
  npm run validate
  ```

  from `packages/rw-crm/`.

  Expected: PASS, including all existing unit, scenario, contract, and package-contract tests plus the new focused tests.

- [ ] **Step 5: Run the full Create Task Plan validation suite.**

  Run:

  ```bash
  python3 -m unittest discover -s tests -v
  python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
  ```

  from `packages/rw-create-task-plan/`.

  Expected: PASS. The plugin remains installable and its contract tests prove it is a conservative consumer of the shared RW CRM policy.

- [ ] **Step 6: Run final repository hygiene checks.**

  Run from `/Users/pol/Documents/ChatGPT/Agents/`:

  ```bash
  git diff --check
  git status --short
  ```

  Expected: `git diff --check` produces no output. `git status --short` lists only the intended documentation and package files, plus any pre-existing user-owned changes that must not be staged or removed.

## Coverage Self-Review

- **Executable model routing:** Task 1 selects a request preset, validates it, propagates assignments into every worker, and blocks escalation until separately confirmed.
- **Confluence subtree context:** Task 2 indexes root `21790813` and every reachable descendant per task, fetches relevant bodies only, and reports partial failures.
- **Shared UI routing:** Task 3 creates one classifier with evidence and makes the plugin’s conservative threshold an explicit policy choice rather than a different definition.
- **Content-bound approvals:** Task 4 hashes plan/edit content, requires both receipts from request approvals, and blocks stale/mutated approvals before any write.
- **Regression and packaging:** Task 5 checks package structure, consumer integration instructions, full tests, plugin validation, documentation, and Git whitespace.

No placeholders remain. The plan intentionally defers context snapshots, repository-policy unification, real non-Confluence adapters, test-corpus work, source allowlists, dry-run reports, naming cleanup, and ledger deduplication because they were medium or low priority in the preserved audit.
