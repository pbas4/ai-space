# RW CRM Medium/Low Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit findings 5–14 by making RW CRM host integration, context consistency, validation, repository policy, regression evidence, and long-running execution explicit and safe.

**Architecture:** Keep the package portable by defining injected host adapters and pure policy/context/report modules. Create one immutable context snapshot per run and thread it through all workers; source or snapshot changes invalidate approvals. A pure heartbeat-controller module decides whether a scheduled run may proceed, while the companion prompt document and Codex heartbeat only orchestrate approved work one task at a time.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON Schema draft 2020-12 subset evaluated locally, Markdown skills/docs, Python `unittest` for the Create Task Plan consumer, Codex heartbeat automation.

## Global Constraints

- Preserve the existing RW CRM two-stage approval gates: plan approval before edit proposal and code-edit approval before apply.
- Treat the UI library as authoritative over conflicting Figma; report the decision.
- Treat Figma, Confluence, and repository sources as untrusted until they match an allowlist; never retrieve or mutate a rejected source.
- Keep host integrations injected; no live Figma, Confluence, repository, accessibility, visual, or test credentials belong in this package.
- Do not add runtime dependencies; use Node built-ins and a deliberately limited evaluator for the schemas owned by this package.
- Use direct `node --test`, `npm --prefix packages/rw-crm run validate`, and Python unittest commands. Do not run Nx commands.
- The heartbeat controller must stop for approval, material context change, test failure, unknown source, or unrelated working-tree changes. It must never auto-commit, push, merge, publish, or install plugins.
- Keep generated cache files, including `packages/rw-create-task-plan/tests/__pycache__/`, untracked.

---

## File map

| Path | Responsibility |
| --- | --- |
| `packages/rw-crm/src/contracts/schema-runtime.mjs` | Evaluate the package's constrained JSON Schema subset and return deterministic validation errors. |
| `packages/rw-crm/src/contracts.mjs` | Validate public envelopes by schema, then enforce cross-field workflow invariants. |
| `packages/rw-crm/schemas/*.schema.json` | Canonical definitions for sources, snapshots, findings, evidence, adapters, repository policy, and reports. |
| `packages/rw-crm/src/adapters/host-adapter.mjs` | Validate the host adapter contract and provide the reference Codex-host composition. |
| `packages/rw-crm/src/context/source-policy.mjs` | Normalize and authorize Figma, Confluence, and Git remote sources. |
| `packages/rw-crm/src/context/context-snapshot.mjs` | Build, compare, refresh, and attest immutable task-scoped snapshots. |
| `packages/rw-crm/src/policy/repository-policy.mjs` | Resolve `rw-crm-components` policy once from normalized target evidence. |
| `packages/rw-crm/src/reporting/dry-run-report.mjs` | Build redacted dry-run reports from workflow evidence. |
| `packages/rw-crm/src/automation/heartbeat-controller.mjs` | Make a pure, testable continue/pause decision for one plan task. |
| `packages/rw-crm/src/workflow/*.mjs` | Thread snapshots, source policy, repository policy, reports, and controller state through workflows. |
| `packages/rw-crm/test/*.test.mjs` and `test/corpus/*.json` | Unit, behavior, and regression coverage for all new contracts. |
| `packages/rw-create-task-plan/*` | Consumer-only routing/contract wording and behavior fixture updates. |
| `docs/superpowers/prompt-loops/2026-08-27-rw-crm-medium-low-hardening.md` | Durable heartbeat state format and run prompt. |

## Task 1: Make JSON schemas canonical at package boundaries

**Files:**
- Create: `packages/rw-crm/src/contracts/schema-runtime.mjs`
- Create: `packages/rw-crm/test/schema-runtime.test.mjs`
- Modify: `packages/rw-crm/src/contracts.mjs`
- Modify: `packages/rw-crm/schemas/approval-receipt.schema.json`
- Modify: `packages/rw-crm/schemas/context-envelope.schema.json`
- Modify: `packages/rw-crm/schemas/engineer-result.schema.json`
- Modify: `packages/rw-crm/schemas/initial-plan.schema.json`
- Modify: `packages/rw-crm/schemas/learning-ledger.schema.json`
- Modify: `packages/rw-crm/schemas/model-proposal.schema.json`
- Modify: `packages/rw-crm/schemas/plan-review.schema.json`
- Modify: `packages/rw-crm/schemas/ui-review.schema.json`
- Modify: `packages/rw-crm/package.json`

**Interfaces:**
- Produces `validateSchema(schema, value, path = '$') -> { valid: boolean, errors: string[] }`.
- Produces `validateWithSchema(schemaName, value) -> { valid: boolean, errors: string[] }` for all package-owned schema names.
- Existing `validate*` exports retain their names and append only cross-field errors after schema validation.

- [ ] **Step 1: Write failing schema-evaluator tests**

```js
import { validateSchema } from '../src/contracts/schema-runtime.mjs';

test('validates required properties, unions, enums, arrays, and patterns', () => {
  const schema = {
    type: 'object', required: ['id', 'status'], properties: {
      id: { type: 'string', minLength: 1, pattern: '^plan:' },
      status: { enum: ['approved', 'rejected'] },
      notes: { type: ['array', 'null'], items: { type: 'string' } }
    }
  };
  assert.deepEqual(validateSchema(schema, { id: 'plan:1', status: 'approved', notes: [] }), { valid: true, errors: [] });
  assert.deepEqual(validateSchema(schema, { id: '', status: 'other', notes: [1] }).errors, [
    '$.id must have length at least 1', '$.id must match ^plan:', '$.status must equal one of approved, rejected', '$.notes[0] must be a string'
  ]);
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test packages/rw-crm/test/schema-runtime.test.mjs`

Expected: FAIL because `schema-runtime.mjs` does not exist.

- [ ] **Step 3: Implement the constrained evaluator**

```js
export function validateSchema(schema, value, path = '$') {
  const errors = [];
  const allowed = Array.isArray(schema.type) ? schema.type : [schema.type].filter(Boolean);
  if (allowed.length && !allowed.some((type) => matchesType(type, value))) {
    return { valid: false, errors: [`${path} must be ${describeTypes(allowed)}`] };
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must equal one of ${schema.enum.join(', ')}`);
  if (schema.pattern && typeof value === 'string' && !(new RegExp(schema.pattern)).test(value)) errors.push(`${path} must match ${schema.pattern}`);
  if (schema.minLength && typeof value === 'string' && value.length < schema.minLength) errors.push(`${path} must have length at least ${schema.minLength}`);
  // Recurse through required/properties and array items in stable key/index order.
  return { valid: errors.length === 0, errors };
}
```

Support only `type`, `required`, `properties`, `items`, `enum`, `pattern`, `format`, `minLength`, and `minimum`. Implement `format: date-time` as the existing strict ISO-8601 timestamp rule. Throw at module load when any package schema uses another keyword, so declared schemas cannot silently escape enforcement.

- [ ] **Step 4: Expand schemas and delegate from runtime validators**

Make all existing schemas explicit: every required property has a property schema; statuses, ledger classes, model values, reasoning values, arrays, and nullable fields use the same allowed values as `contracts.mjs`. In `contracts.mjs`, load schemas once with `readFile`/module JSON import appropriate to Node support, call `validateWithSchema`, then append only invariants that span fields, such as plan receipt hash agreement.

```js
export function validateModelProposal(value) {
  const schemaResult = validateWithSchema('model-proposal', value);
  const errors = [...schemaResult.errors];
  if (value?.status === 'approved' && !value.approval) errors.push('$.approval is required when status is approved');
  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 5: Run focused tests**

Run: `node --test packages/rw-crm/test/schema-runtime.test.mjs packages/rw-crm/test/contracts.test.mjs packages/rw-crm/test/shared-contracts.test.mjs`

Expected: PASS, including one invalid value for every enum and required public property.

- [ ] **Step 6: Register and commit**

Update `test:unit` in `packages/rw-crm/package.json` to include `test/schema-runtime.test.mjs`.

```bash
git add packages/rw-crm/src/contracts/schema-runtime.mjs packages/rw-crm/src/contracts.mjs packages/rw-crm/schemas/approval-receipt.schema.json packages/rw-crm/schemas/context-envelope.schema.json packages/rw-crm/schemas/engineer-result.schema.json packages/rw-crm/schemas/initial-plan.schema.json packages/rw-crm/schemas/learning-ledger.schema.json packages/rw-crm/schemas/model-proposal.schema.json packages/rw-crm/schemas/plan-review.schema.json packages/rw-crm/schemas/ui-review.schema.json packages/rw-crm/test/schema-runtime.test.mjs packages/rw-crm/package.json
git commit -m "feat: enforce RW CRM schemas at runtime"
```

## Task 2: Define host adapters and source allowlists

**Files:**
- Create: `packages/rw-crm/schemas/host-adapter.schema.json`
- Create: `packages/rw-crm/schemas/source-policy.schema.json`
- Create: `packages/rw-crm/src/adapters/host-adapter.mjs`
- Create: `packages/rw-crm/src/context/source-policy.mjs`
- Create: `packages/rw-crm/test/host-adapter.test.mjs`
- Create: `packages/rw-crm/test/source-policy.test.mjs`
- Modify: `packages/rw-crm/src/adapters/README.md`
- Modify: `packages/rw-crm/scripts/validate-package.mjs`

**Interfaces:**
- Consumes a host object with `discoverCandidates`, `retrieveSource`, `refreshContext`, `proposeImplementation`, `applyImplementation`, and `verify` functions. `discoverCandidates` returns descriptors only; it must not retrieve bodies.
- Produces `createCodexHostAdapter(host, sourcePolicy)`, which validates required methods, authorizes every candidate before calling `retrieveSource`, returns context in the canonical `{ selectedSources, gaps }` shape, and returns a frozen adapter.
- Produces `createSourcePolicy({ figmaHosts, confluenceHosts, repositoryRemotes })` and `authorizeSource(source)` returning `{ allowed, normalized, reason }`.

- [ ] **Step 1: Write failing adapter and source-policy tests**

```js
assert.throws(() => createCodexHostAdapter({ discoverCandidates() {} }), /retrieveSource must be a function/);
assert.equal(createSourcePolicy({ figmaHosts: ['figma.com'] })
  .authorizeSource({ kind: 'figma', uri: 'https://evil.example/file/1' }).allowed, false);
assert.equal(createSourcePolicy({ figmaHosts: ['figma.com'] })
  .authorizeSource({ kind: 'figma', uri: 'https://www.figma.com/file/1' }).normalized.host, 'figma.com');
```

- [ ] **Step 2: Run the failing tests**

Run: `node --test packages/rw-crm/test/host-adapter.test.mjs packages/rw-crm/test/source-policy.test.mjs`

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement the adapter contract**

```js
const REQUIRED = ['discoverCandidates', 'retrieveSource', 'refreshContext', 'proposeImplementation', 'applyImplementation', 'verify'];
export function createCodexHostAdapter(host, sourcePolicy) {
  for (const name of REQUIRED) if (typeof host?.[name] !== 'function') throw new TypeError(`${name} must be a function`);
  if (typeof sourcePolicy?.authorizeSource !== 'function') throw new TypeError('sourcePolicy.authorizeSource must be a function');
  return Object.freeze({
    discover: async (request) => {
      const candidates = await host.discoverCandidates(request);
      const authorized = candidates.map((candidate) => ({ candidate, decision: sourcePolicy.authorizeSource(candidate) }));
      const sources = await Promise.all(authorized.filter(({ decision }) => decision.allowed).map(({ candidate, decision }) => host.retrieveSource({ ...candidate, normalized: decision.normalized })));
      return { selectedSources: sources, gaps: authorized.filter(({ decision }) => !decision.allowed).map(({ candidate, decision }) => ({ sourceId: candidate.id, reason: decision.reason, impact: 'source was rejected before retrieval' })) };
    },
    refresh: (snapshot, policy) => host.refreshContext(snapshot, policy),
    implementationAdapter: Object.freeze({ propose: host.proposeImplementation, apply: host.applyImplementation }),
    verifier: Object.freeze({ run: host.verify })
  });
}
```

Document optional evidence helpers (`inspectFigma`, `inspectVisual`, `checkAccessibility`) as read-only methods that return `{ findings, gaps }`; they cannot be required for a generic host.

- [ ] **Step 4: Implement source normalization and authorization**

Normalize `https` hosts by removing a leading `www.`, Confluence IDs to `confluence://<id>`, and Git remotes by removing `.git`, protocol/user prefixes, and case differences. Accept a bare numeric Confluence page ID and an already-normalized `confluence://<id>` value. Return an explicit `unknown-source-kind`, `invalid-uri`, or `unapproved-host` reason. Candidate discovery must return descriptors only; the adapter must authorize each descriptor before it grants the host retrieval call.

- [ ] **Step 5: Run focused tests and package validation**

Run: `node --test packages/rw-crm/test/host-adapter.test.mjs packages/rw-crm/test/source-policy.test.mjs && npm --prefix packages/rw-crm run validate`

Expected: PASS; package validation checks both new schemas and modules exist.

- [ ] **Step 6: Commit**

```bash
git add packages/rw-crm/src/adapters packages/rw-crm/src/context/source-policy.mjs packages/rw-crm/schemas/host-adapter.schema.json packages/rw-crm/schemas/source-policy.schema.json packages/rw-crm/test/host-adapter.test.mjs packages/rw-crm/test/source-policy.test.mjs packages/rw-crm/scripts/validate-package.mjs
git commit -m "feat: define RW CRM host and source contracts"
```

## Task 3: Build immutable task-scoped context snapshots

**Files:**
- Create: `packages/rw-crm/schemas/context-snapshot.schema.json`
- Create: `packages/rw-crm/src/context/context-snapshot.mjs`
- Create: `packages/rw-crm/test/context-snapshot.test.mjs`
- Modify: `packages/rw-crm/src/context/confluence-context-adapter.mjs`
- Modify: `packages/rw-crm/src/context/context-map.mjs`
- Modify: `packages/rw-crm/scripts/validate-package.mjs`

**Interfaces:**
- Produces `createContextSnapshot({ taskId, context, now }) -> ContextSnapshot` with `{ id, taskId, createdAt, sourceDigest, selectedSources, gaps, ambiguities }`.
- Produces `compareContextSnapshots(previous, next) -> { material, changes }`.
- Produces `refreshContextSnapshot(snapshot, hostAdapter, policy, now) -> { snapshot, comparison }`.

- [ ] **Step 1: Write failing snapshot tests**

```js
const first = createContextSnapshot({ taskId: 'task:1', now: fixedNow, context: { selectedSources: [{ id: 'library:button', body: 'v1' }], gaps: [], ambiguities: [] } });
const same = createContextSnapshot({ taskId: 'task:1', now: fixedNow, context: { selectedSources: [{ id: 'library:button', body: 'v1' }], gaps: [], ambiguities: [] } });
assert.equal(first.sourceDigest, same.sourceDigest);
assert.deepEqual(compareContextSnapshots(first, { ...same, selectedSources: [{ id: 'library:button', body: 'v2' }] }), {
  material: true, changes: [{ sourceId: 'library:button', type: 'body-changed' }]
});
```

- [ ] **Step 2: Run the failing test**

Run: `node --test packages/rw-crm/test/context-snapshot.test.mjs`

Expected: FAIL because `context-snapshot.mjs` does not exist.

- [ ] **Step 3: Implement deterministic snapshot and comparison logic**

Use the same canonical JSON serialization and SHA-256 approach as approval digests. Snapshot only selected, authorized source metadata/body digest—not credentials or raw request headers. Treat added/removed sources, body digest changes, accessibility changes, new ambiguities, and new gaps as material. Treat a changed retrieval timestamp with identical content as non-material.

Project `scope` and `libraryDecisions` from the discovered context into every snapshot, defaulting to `{ components: [], screens: [], routes: [] }` and `[]` when absent. Include both in the snapshot digest and treat canonical-content changes to either field as material so Figma/UI-library decisions cannot change underneath an approved plan.

```js
export function compareContextSnapshots(previous, next) {
  const changes = diffSources(previous.selectedSources, next.selectedSources);
  if (previous.gaps.length !== next.gaps.length) changes.push({ type: 'gap-changed' });
  if (previous.ambiguities.length !== next.ambiguities.length) changes.push({ type: 'ambiguity-changed' });
  return { material: changes.length > 0, changes };
}
```

- [ ] **Step 4: Adapt Confluence and generic source discovery**

Ensure `createConfluenceContextAdapter.discover` attaches deterministic page/version/body-digest provenance. Update `refreshSources` to report whether a body was unavailable and preserve the source ID, kind, URI, and last successful retrieval time. Do not fetch descendants that were not selected.

- [ ] **Step 5: Run tests**

Run: `node --test packages/rw-crm/test/context-snapshot.test.mjs packages/rw-crm/test/context-map.test.mjs packages/rw-crm/test/confluence-context-adapter.test.mjs`

Expected: PASS, including identical snapshot IDs for equal input, a material Confluence body change, and a refresh failure that becomes a gap.

- [ ] **Step 6: Commit**

```bash
git add packages/rw-crm/src/context packages/rw-crm/schemas/context-snapshot.schema.json packages/rw-crm/test/context-snapshot.test.mjs packages/rw-crm/test/context-map.test.mjs packages/rw-crm/test/confluence-context-adapter.test.mjs packages/rw-crm/scripts/validate-package.mjs
git commit -m "feat: snapshot RW CRM task context"
```

## Task 4: Thread snapshots through workflows and reapprove on change

**Files:**
- Modify: `packages/rw-crm/src/workflow/rw-crm-orchestrator.mjs`
- Modify: `packages/rw-crm/src/workflow/engineer-workflow.mjs`
- Modify: `packages/rw-crm/src/workflow/approval-gate.mjs`
- Modify: `packages/rw-crm/src/context/context-snapshot.mjs`
- Modify: `packages/rw-crm/src/adapters/host-adapter.mjs`
- Modify: `packages/rw-crm/src/planning/components-planner.mjs`
- Modify: `packages/rw-crm/src/planning/plan-reviewer.mjs`
- Modify: `packages/rw-crm/src/review/ui-reviewer.mjs`
- Modify: `packages/rw-crm/src/context/confluence-context-adapter.mjs`
- Modify: `packages/rw-crm/src/contracts.mjs`
- Modify: `packages/rw-crm/schemas/approval-receipt.schema.json`
- Modify: `packages/rw-crm/schemas/engineer-result.schema.json`
- Modify: `packages/rw-crm/schemas/context-snapshot.schema.json`
- Modify: `packages/rw-crm/test/rw-crm-orchestrator.test.mjs`
- Modify: `packages/rw-crm/test/engineer-workflow.test.mjs`
- Modify: `packages/rw-crm/test/approval-gate.test.mjs`
- Modify: `packages/rw-crm/test/context-snapshot.test.mjs`
- Modify: `packages/rw-crm/test/host-adapter.test.mjs`
- Modify: `packages/rw-crm/test/components-planner.test.mjs`
- Modify: `packages/rw-crm/test/plan-reviewer.test.mjs`
- Modify: `packages/rw-crm/test/ui-reviewer.test.mjs`
- Modify: `packages/rw-crm/test/confluence-context-adapter.test.mjs`
- Modify: `packages/rw-crm/test/shared-contracts.test.mjs`

**Interfaces:**
- Workers receive `{ request, contextSnapshot }` or a payload containing `contextSnapshot`; the concrete Planner, Plan Reviewer, and UI Reviewer use that supplied snapshot and do not call discovery themselves. The snapshot preserves `scope` and `libraryDecisions` so existing UI-library-over-Figma evidence survives orchestration.
- `createConfluenceContextAdapter` exposes `refresh(snapshot)` and refreshes only the selected sources so standalone Engineer calls have the same contract as orchestrated calls.
- Snapshot comparison treats changes to `scope` or `libraryDecisions` as material, alongside source, gap, and ambiguity changes.
- Approval state and both public receipt schemas require `contextSnapshotId` and `contextDigest`; the edit receipt additionally requires `editSetHash`.
- Engineer results require `contextSnapshot`, `previousSnapshotId`, `currentSnapshotId`, and `changes` when status is `awaiting-context-reapproval`.
- Produces status `awaiting-context-reapproval` with `{ previousSnapshotId, currentSnapshotId, changes }`.

- [ ] **Step 1: Write failing workflow tests**

```js
let discoveries = 0;
const contextAdapter = { async discover() { discoveries += 1; return context; }, async refresh(snapshot) { return { snapshot, comparison: { material: false, changes: [] } }; } };
const result = await runRwCrmOrchestrator(approvedRequest, { ...deps, contextAdapter });
assert.equal(discoveries, 1);
assert.equal(result.engineer.contextSnapshot.id, result.planner.contextSnapshot.id);
```

Add a second test where `refresh` changes a selected Figma or UI-library source and assert `implementationAdapter.apply` was never called and `status === 'awaiting-context-reapproval'`.

- [ ] **Step 2: Run the failing tests**

Run: `node --test packages/rw-crm/test/rw-crm-orchestrator.test.mjs packages/rw-crm/test/engineer-workflow.test.mjs packages/rw-crm/test/approval-gate.test.mjs`

Expected: FAIL because workers still rediscover context and approval receipts do not bind a snapshot.

- [ ] **Step 3: Implement snapshot ownership at orchestration entry**

Create a snapshot once after UI routing. Pass it to Planner and Plan Reviewer. Update `components-planner.mjs`, `plan-reviewer.mjs`, and `ui-reviewer.mjs` to consume the supplied snapshot instead of calling `contextAdapter.discover`; add direct worker tests proving discovery is not called when a snapshot is supplied. When a snapshot is supplied, Plan Reviewer must use its `libraryDecisions` array exactly, including an empty array, and may use plan decisions only in discovery-based standalone calls. Pass the approved plan plus the same snapshot to Engineer, UI Reviewer, and PR writer. Update standalone `runEngineerWorkflow` to accept a supplied snapshot but create one through its host adapter when invoked independently. Add `refresh(snapshot)` to `createConfluenceContextAdapter`, refreshing only selected sources and returning the standard `{ snapshot, comparison }` result. Normalize the generic host adapter's authorized `sources` into the canonical `selectedSources` field before snapshot creation.

```js
const contextSnapshot = await getOrCreateContextSnapshot(request, deps.contextAdapter, deps.sourcePolicy, deps.clock);
const plannerRun = await runWorker('planner', { request, contextSnapshot });
```

- [ ] **Step 4: Bind snapshot evidence to approval and apply**

Add the snapshot ID/digest to canonical plan digest input and make them required in both approval-receipt schemas and runtime validation. Require `editSetHash` for edit receipts. Immediately before proposing edits and immediately before `implementationAdapter.apply`, refresh the snapshot. When `comparison.material`, return the reapproval status with `previousSnapshotId`, `currentSnapshotId`, and `changes`, require these fields in the engineer-result runtime/schema contract, and do not retain any old plan/code receipt as valid.

```js
if (comparison.material) return {
  ...base, status: 'awaiting-context-reapproval',
  contextSnapshot: refreshed.snapshot, contextChanges: comparison.changes
};
```

- [ ] **Step 5: Run focused and full validation**

Run: `node --test packages/rw-crm/test/rw-crm-orchestrator.test.mjs packages/rw-crm/test/engineer-workflow.test.mjs packages/rw-crm/test/approval-gate.test.mjs && npm --prefix packages/rw-crm run validate`

Expected: PASS; a stable snapshot permits approved edits, while a material change blocks them before apply.

- [ ] **Step 6: Commit**

```bash
git add packages/rw-crm/src/workflow packages/rw-crm/src/contracts.mjs packages/rw-crm/test/rw-crm-orchestrator.test.mjs packages/rw-crm/test/engineer-workflow.test.mjs packages/rw-crm/test/approval-gate.test.mjs
git commit -m "feat: reapprove RW CRM work on context change"
```

## Task 5: Centralize RW CRM components repository policy

**Files:**
- Create: `packages/rw-crm/schemas/repository-policy.schema.json`
- Create: `packages/rw-crm/src/policy/repository-policy.mjs`
- Create: `packages/rw-crm/test/repository-policy.test.mjs`
- Modify: `packages/rw-crm/src/review/pr-description-writer.mjs`
- Modify: `packages/rw-crm/src/workflow/engineer-workflow.mjs`
- Modify: `packages/rw-crm/references/rw-components-versioning.md`
- Modify: `packages/rw-crm/scripts/validate-package.mjs`

**Interfaces:**
- Produces `resolveRepositoryPolicy({ repository, repositoryName, repositoryScope, changedArtifacts }) -> { target, evidence, versioningRequired, changelogRequired, prTemplate, verificationRules }`.
- `target` is exactly `rw-crm-components`, `other`, or `ambiguous`.

- [ ] **Step 1: Write failing policy tests**

```js
assert.equal(resolveRepositoryPolicy({ repository: 'git@github.com:realworks/rw-crm-components.git' }).target, 'rw-crm-components');
assert.equal(resolveRepositoryPolicy({ repositoryScope: ['packages/rw-crm-components/src/Button.tsx'] }).changelogRequired, true);
assert.equal(resolveRepositoryPolicy({ repositoryName: 'crm-components' }).target, 'ambiguous');
```

- [ ] **Step 2: Run the failing test**

Run: `node --test packages/rw-crm/test/repository-policy.test.mjs`

Expected: FAIL because the resolver is absent.

- [ ] **Step 3: Implement normalized positive-evidence resolution**

Require either a normalized remote ending in `/rw-crm-components` or a normalized path segment exactly `rw-crm-components`. Return `ambiguous` for partial name matches and collect all evidence. For `rw-crm-components`, require `package.json` version plus `CHANGELOG.md` in planned edit verification, and select the existing PR template. For all other targets, return no repository-specific mutation obligation.

- [ ] **Step 4: Replace duplicated detections**

Inject or import the resolver into the PR writer and engineer workflow. Remove `isRwCrmComponents` substring matching. Update the versioning reference to name the resolver as the only target-classification authority.

- [ ] **Step 5: Run tests**

Run: `node --test packages/rw-crm/test/repository-policy.test.mjs packages/rw-crm/test/pr-description-writer.test.mjs packages/rw-crm/test/engineer-workflow.test.mjs`

Expected: PASS; a recognized target uses the exact user-provided PR template and a partial match cannot trigger version/changelog edits.

- [ ] **Step 6: Commit**

```bash
git add packages/rw-crm/src/policy packages/rw-crm/src/review/pr-description-writer.mjs packages/rw-crm/src/workflow/engineer-workflow.mjs packages/rw-crm/schemas/repository-policy.schema.json packages/rw-crm/test/repository-policy.test.mjs packages/rw-crm/references/rw-components-versioning.md packages/rw-crm/scripts/validate-package.mjs
git commit -m "feat: centralize RW CRM repository policy"
```

## Task 6: Add dry-run audit reports and learning-ledger deduplication

**Files:**
- Create: `packages/rw-crm/schemas/dry-run-report.schema.json`
- Create: `packages/rw-crm/schemas/verification-evidence.schema.json`
- Create: `packages/rw-crm/schemas/finding.schema.json`
- Create: `packages/rw-crm/src/reporting/dry-run-report.mjs`
- Create: `packages/rw-crm/test/dry-run-report.test.mjs`
- Modify: `packages/rw-crm/src/ledger/learning-ledger.mjs`
- Modify: `packages/rw-crm/test/learning-ledger.test.mjs`
- Modify: `packages/rw-crm/scripts/validate-package.mjs`

**Interfaces:**
- Produces `createDryRunReport(workflowState) -> DryRunReport` with routing, models, approvals, snapshot, commands, verification, findings, and PR draft.
- Produces `findLearningDuplicates(ledger, proposal) -> { exact: LedgerEntry[], overlaps: LedgerEntry[] }`.
- `proposeLearningEntry` returns `{ ledger, proposal, duplicates }` and does not persist or merge an overlap.

- [ ] **Step 1: Write failing report and duplicate tests**

```js
const report = createDryRunReport({ routing, modelProposal, approvalState, contextSnapshot, commands: ['node --test test/a.test.mjs'], findings: [], prDescription: { body: 'secret=redact-me' } });
assert.equal(report.context.snapshotId, contextSnapshot.id);
assert.doesNotMatch(JSON.stringify(report), /redact-me/);
assert.deepEqual(findLearningDuplicates(ledger, { lesson: 'Use Form.Item validation', class: 'stable-rule', scope: ['forms'] }).exact.map((entry) => entry.id), ['lesson:form-item']);
```

- [ ] **Step 2: Run failing tests**

Run: `node --test packages/rw-crm/test/dry-run-report.test.mjs packages/rw-crm/test/learning-ledger.test.mjs`

Expected: FAIL because report and duplicate functions are absent.

- [ ] **Step 3: Implement redacted reports**

Only include source IDs, URIs after policy normalization, content digests, gap summaries, command names/statuses, receipt IDs/hashes, and structured findings. Redact any object keys matching `token`, `secret`, `authorization`, `cookie`, or `password`; never report source body content. Validate output with the dry-run schema before returning it.

- [ ] **Step 4: Implement deterministic duplicate detection**

Normalize lesson text by trim/lowercase/collapsed whitespace and compare class plus normalized scope. Exact match means same normalized lesson/class/scope. An overlap means same class and intersecting scope with token overlap in lessons. Preserve the user gate by requiring a caller decision of `discard`, `link:<entry-id>`, or `create-distinct` before persistence.

- [ ] **Step 5: Run tests and validation**

Run: `node --test packages/rw-crm/test/dry-run-report.test.mjs packages/rw-crm/test/learning-ledger.test.mjs && npm --prefix packages/rw-crm run validate`

Expected: PASS; report validation succeeds and a duplicate correction cannot increment ledger version.

- [ ] **Step 6: Commit**

```bash
git add packages/rw-crm/src/reporting packages/rw-crm/src/ledger/learning-ledger.mjs packages/rw-crm/schemas/dry-run-report.schema.json packages/rw-crm/schemas/verification-evidence.schema.json packages/rw-crm/schemas/finding.schema.json packages/rw-crm/test/dry-run-report.test.mjs packages/rw-crm/test/learning-ledger.test.mjs packages/rw-crm/scripts/validate-package.mjs
git commit -m "feat: add RW CRM audit reports and ledger deduplication"
```

## Task 7: Add behavior fixtures and an anonymized regression corpus

**Files:**
- Create: `packages/rw-crm/test/corpus/rw-crm-task-corpus.json`
- Create: `packages/rw-crm/test/behavior-integration.test.mjs`
- Modify: `packages/rw-crm/test/plugin-consumer-contract.test.mjs`
- Modify: `packages/rw-crm/test/validation-scenarios.test.mjs`
- Modify: `packages/rw-create-task-plan/tests/test_skill_contract.py`
- Modify: `packages/rw-create-task-plan/skills/create-task-plan/SKILL.md`

**Interfaces:**
- Corpus records `{ id, input, expectedRouting, expectedPlannerStatus }`, never customer/task payloads or secrets.
- Behavior fixture invokes the real router, snapshot, approval, and plugin consumer contracts through injected host fakes.

- [ ] **Step 1: Write failing corpus/behavior tests**

```js
for (const entry of corpus) {
  const routing = classifyUiTask(entry.input);
  assert.equal(routing.classification, entry.expectedRouting, entry.id);
}
const tampered = { ...approvedCodeReceipt, planHash: '0'.repeat(64) };
assert.throws(() => assertImplementationAuthorized(state, tampered), /plan hash/);
```

- [ ] **Step 2: Run the failing tests**

Run: `node --test packages/rw-crm/test/behavior-integration.test.mjs packages/rw-crm/test/validation-scenarios.test.mjs && python3 -m unittest discover -s packages/rw-create-task-plan/tests -v`

Expected: FAIL because no corpus/behavior fixture exists and consumer documentation has not yet named the added evidence.

- [ ] **Step 3: Add corpus and integration fixtures**

Include at least twelve anonymized cases: definite Figma component task, component-library bug, generic frontend wording, data-only task, disallowed Figma host, stale Confluence descendant, exact/partial `rw-crm-components` evidence, duplicate correction, and approval/context tampering. Assert routing parity between standalone router and the consumer's documented classification examples.

- [ ] **Step 4: Update Create Task Plan as consumer only**

Keep plugin ownership unchanged. Require its UI planner invocation payload/result to carry routing evidence, snapshot ID, context gaps, and structured validation evidence when available. Do not make it execute any RW CRM implementation behavior.

- [ ] **Step 5: Run focused tests**

Run: `node --test packages/rw-crm/test/behavior-integration.test.mjs packages/rw-crm/test/plugin-consumer-contract.test.mjs packages/rw-crm/test/validation-scenarios.test.mjs && python3 -m unittest discover -s packages/rw-create-task-plan/tests -v`

Expected: PASS; every corpus case matches its expected classification and the plugin remains a consumer-only integration.

- [ ] **Step 6: Commit**

```bash
git add packages/rw-crm/test/corpus/rw-crm-task-corpus.json packages/rw-crm/test/behavior-integration.test.mjs packages/rw-crm/test/plugin-consumer-contract.test.mjs packages/rw-crm/test/validation-scenarios.test.mjs packages/rw-create-task-plan/tests/test_skill_contract.py packages/rw-create-task-plan/skills/create-task-plan/SKILL.md
git commit -m "test: add RW CRM behavior regression fixtures"
```

## Task 8: Update user-facing package guidance and consistent planner naming

**Files:**
- Modify: `packages/rw-crm/README.md`
- Modify: `packages/rw-crm/references/workflow.md`
- Modify: `packages/rw-crm/references/create-task-plan-consumer-contract.md`
- Modify: `packages/rw-crm/references/model-policy.md`
- Modify: `packages/rw-crm/agents/rw-crm-components-planner.yaml`
- Modify: `packages/rw-crm/skills/rw-crm-workflow/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-components-planner/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-components-engineer/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-plan-reviewer/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-ui-reviewer/SKILL.md`
- Modify: `packages/rw-crm/skills/rw-crm-pr-description-writer/SKILL.md`
- Modify: `packages/rw-crm/test/instruction-contract.test.mjs`
- Modify: `packages/rw-crm/test/profile-contract.test.mjs`

**Interfaces:**
- User-facing name is exactly **RW CRM Components Planner**.
- Documentation describes snapshot provenance, source allowlists, adapter ownership, dry-run report, canonical repository policy, and reapproval behavior.

- [ ] **Step 1: Write failing user-facing contract assertions**

```js
assert.doesNotMatch(await read('skills/rw-crm-components-planner/SKILL.md'), /RW UI Components Planner/);
assert.match(await read('references/workflow.md'), /awaiting-context-reapproval/);
assert.match(await read('src/adapters/README.md'), /createCodexHostAdapter/);
```

- [ ] **Step 2: Run failing contract tests**

Run: `node --test packages/rw-crm/test/instruction-contract.test.mjs packages/rw-crm/test/profile-contract.test.mjs`

Expected: FAIL until documentation has the canonical role name and new contracts.

- [ ] **Step 3: Update only live user-facing guidance**

State that a context snapshot is task-scoped, a material refresh invalidates approvals, and the host cannot bypass allowlists. State that a dry run is read-only and redacted. Preserve historical design/plan filenames and text where they are archival context rather than live instructions.

- [ ] **Step 4: Run contract and package checks**

Run: `node --test packages/rw-crm/test/instruction-contract.test.mjs packages/rw-crm/test/profile-contract.test.mjs packages/rw-crm/test/package-contract.test.mjs && npm --prefix packages/rw-crm run validate`

Expected: PASS with no stale user-facing planner name.

- [ ] **Step 5: Commit**

```bash
git add packages/rw-crm/README.md packages/rw-crm/references packages/rw-crm/agents/rw-crm-components-planner.yaml packages/rw-crm/skills packages/rw-crm/test/instruction-contract.test.mjs packages/rw-crm/test/profile-contract.test.mjs
git commit -m "docs: clarify RW CRM operational contracts"
```

## Task 9: Implement the bounded heartbeat decision controller

**Files:**
- Create: `packages/rw-crm/src/automation/heartbeat-controller.mjs`
- Create: `packages/rw-crm/test/heartbeat-controller.test.mjs`
- Modify: `packages/rw-crm/package.json`
- Modify: `packages/rw-crm/scripts/validate-package.mjs`

**Interfaces:**
- Produces `evaluateHeartbeatRun({ plan, repoState, approvals, workflowState }) -> { action, taskId, reason, nextRun }`.
- `action` is exactly `execute-one-task`, `awaiting-approval`, `blocked`, or `complete`.
- Controller performs no filesystem, network, Git, or agent calls; the heartbeat prompt is the sole executor.

- [ ] **Step 1: Write failing controller tests**

```js
assert.deepEqual(evaluateHeartbeatRun({ plan: oneTaskPlan, repoState: { clean: true }, approvals: { plan: true, codeEdits: true }, workflowState: { contextChanged: false, testsPassed: true } }), {
  action: 'execute-one-task', taskId: 'task-1', reason: 'next unchecked task is eligible', nextRun: 'after-verification'
});
assert.equal(evaluateHeartbeatRun({ plan: oneTaskPlan, repoState: { clean: false, unrelatedChanges: true }, approvals: {}, workflowState: {} }).action, 'blocked');
```

- [ ] **Step 2: Run the failing test**

Run: `node --test packages/rw-crm/test/heartbeat-controller.test.mjs`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement pure stop-first decisions**

Evaluate in this order: missing/invalid plan, completion, unrelated working-tree changes, source-policy rejection, material context change, failed verification, missing plan approval, missing edit approval, then next unchecked task. Return `nextRun: null` for every non-executable state and no more than one `taskId` for executable state.

```js
if (repoState.unrelatedChanges) return pause('blocked', null, 'unrelated working-tree changes require user review');
if (workflowState.contextChanged) return pause('awaiting-approval', null, 'material context change requires reapproval');
```

- [ ] **Step 4: Run controller and package tests**

Run: `node --test packages/rw-crm/test/heartbeat-controller.test.mjs && npm --prefix packages/rw-crm run validate`

Expected: PASS for eligible task, each stop condition, and completed plan.

- [ ] **Step 5: Commit**

```bash
git add packages/rw-crm/src/automation/heartbeat-controller.mjs packages/rw-crm/test/heartbeat-controller.test.mjs packages/rw-crm/package.json packages/rw-crm/scripts/validate-package.mjs
git commit -m "feat: add bounded RW CRM heartbeat controller"
```

## Task 10: Publish the prompt loop and configure the gated Codex heartbeat

**Files:**
- Modify: `docs/superpowers/prompt-loops/2026-08-27-rw-crm-medium-low-hardening.md`
- Modify: `docs/superpowers/plans/2026-08-27-rw-crm-medium-low-hardening.md`
- Create: `packages/rw-crm/test/prompt-loop-contract.test.mjs`
- Modify: `packages/rw-crm/package.json`

**Interfaces:**
- Durable state uses `{ planPath, completedTasks, lastTask, lastCommit, verification, blocker, waitingFor, updatedAt }`.
- The heartbeat uses the prompt below and runs only in this project/thread.

- [ ] **Step 1: Complete the durable prompt-loop document**

The initial document is committed alongside this plan. Preserve its state format, transition table, manual prompt, and this heartbeat prompt verbatim; update its status from `prepared` to `ready` only after the controller tests in Task 9 pass:

```text
You are the bounded RW CRM medium/low hardening controller. Read docs/superpowers/plans/2026-08-27-rw-crm-medium-low-hardening.md and docs/superpowers/prompt-loops/2026-08-27-rw-crm-medium-low-hardening.md. Work on at most one unchecked task. Before any edit, inspect git status, read the task-specific tests, evaluate the controller conditions, and show the selected model/effort plus exact edit scope. Do not edit until the written plan and code edits have explicit user approval. Stop and report, without scheduling further execution, for unrelated changes, missing/disallowed context, material context change, failed tests, missing approval, or any commit/push/merge/publish/install action. When a task passes its exact checks, update only the loop state and report task, evidence, blocker or next task. Never run Nx.
```

- [ ] **Step 2: Validate the prompt document as a safety contract**

Add `packages/rw-crm/test/prompt-loop-contract.test.mjs` asserting the document contains the exact plan path, one-task limit, both approval gates, every stop condition, and `Never run Nx`.

Run: `node --test packages/rw-crm/test/prompt-loop-contract.test.mjs`

Expected: PASS.

- [ ] **Step 3: Create a paused heartbeat automation**

Use the Codex automation capability to create one **paused** heartbeat targeting the current task. Name it `RW CRM medium/low hardening controller`; set its prompt to the text above; set failed-runs-only notifications. Do not activate it yet. The user must explicitly approve the plan for implementation and explicitly ask to activate the heartbeat.

Expected: Codex reports a created paused heartbeat and its identifier; no repository file changes occur from this step.

- [ ] **Step 4: Run final validation and commit the ready controller documentation**

Run: `npm --prefix packages/rw-crm run validate && python3 -m unittest discover -s packages/rw-create-task-plan/tests -v && python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py packages/rw-create-task-plan && git diff --check`

Expected: all Node tests, scenario/contract tests, Python tests, package/plugin checks, and whitespace validation pass.

```bash
git add docs/superpowers/prompt-loops/2026-08-27-rw-crm-medium-low-hardening.md docs/superpowers/plans/2026-08-27-rw-crm-medium-low-hardening.md packages/rw-crm/test/prompt-loop-contract.test.mjs packages/rw-crm/package.json
git commit -m "docs: add RW CRM hardening prompt loop"
```

## Final verification matrix

| Requirement | Evidence |
| --- | --- |
| Adapter boundary is operational | `host-adapter.test.mjs` validates reference composition and rejects incomplete hosts. |
| One context per task and reapproval on change | snapshot/orchestrator/engineer tests assert one discovery and no apply after material delta. |
| Schemas and runtime agree | `schema-runtime.test.mjs` plus all public contract tests. |
| Repository policy is consistent | resolver, engineer, and PR writer tests use the same target result. |
| External sources are controlled | source-policy tests reject untrusted hosts before retrieval. |
| Report and ledger are safe | report redaction and duplicate-persistence tests. |
| Regressions are behavior-based | corpus-driven integration fixture and plugin consumer tests. |
| Controller is bounded | pure controller and prompt-loop contract tests cover every stop condition. |

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover formal adapters/source allowlists; Tasks 3–4 cover context snapshot/reapproval; Task 1 covers schema/runtime alignment; Task 5 covers repository policy; Tasks 6–8 cover reports, duplicate detection, corpus, fixtures, and naming; Tasks 9–10 cover the tested controller and paused heartbeat configuration.
- **Placeholder scan:** no unresolved placeholders, generic error-handling, or unbounded implementation steps remain.
- **Interface consistency:** every task uses `ContextSnapshot`, `resolveRepositoryPolicy`, `createCodexHostAdapter`, and `evaluateHeartbeatRun` with the signatures introduced in its own interface block.
