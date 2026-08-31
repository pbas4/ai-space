import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyUiTask, routeUiTask } from '../src/routing/ui-task-router.mjs';
import { createContextSnapshot } from '../src/context/context-snapshot.mjs';
import { approveCodeEdits, approvePlan, assertImplementationAuthorized, createApprovalState, createEditSetDigest, createPlanDigest, proposeCodeEdits } from '../src/workflow/approval-gate.mjs';

const corpus = JSON.parse(await readFile(new URL('./corpus/rw-crm-task-corpus.json', import.meta.url), 'utf8'));

test('anonymized corpus preserves standalone and consumer routing parity', () => {
  for (const entry of corpus) {
    const routing = classifyUiTask(entry.input);
    assert.equal(routing.classification, entry.expectedRouting, entry.id);
    assert.equal(routeUiTask(entry.input).classification, entry.expectedRouting, entry.id);
    assert.equal(typeof entry.expectedPlannerStatus, 'string', `${entry.id}: planner status missing`);
  }
});

test('injected host context produces a real immutable snapshot and evidence envelope', () => {
  const host = {
    async discover() {
      return {
        selectedSources: [{ id: 'library:button', kind: 'ui-library', uri: 'https://library.example/button', body: { component: 'Button' } }],
        scope: { components: ['Button'], screens: [], routes: [] },
        libraryDecisions: [{ topic: 'authority', decision: 'library-over-figma' }],
        gaps: [],
        ambiguities: []
      };
    }
  };
  return host.discover().then((context) => {
    const snapshot = createContextSnapshot({ taskId: 'corpus-task', context, now: '2026-08-27T10:00:00.000Z' });
    assert.match(snapshot.id, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(snapshot.selectedSources[0].body, undefined);
    assert.equal(snapshot.libraryDecisions[0].decision, 'library-over-figma');
  });
});

test('approval evidence rejects plan tampering after both approvals are prepared', () => {
  const plan = { id: 'plan:corpus', goal: 'Update Button' };
  const snapshot = createContextSnapshot({ taskId: 'corpus-task', context: { selectedSources: [], scope: { components: ['Button'] }, libraryDecisions: [], gaps: [], ambiguities: [] }, now: '2026-08-27T10:00:00.000Z' });
  const initial = createApprovalState(plan, snapshot);
  const planApproval = approvePlan(initial, { planId: plan.id, planHash: createPlanDigest(plan, snapshot), contextSnapshotId: snapshot.id, contextDigest: snapshot.sourceDigest, approvedBy: 'Pol', approvedAt: '2026-08-27T10:01:00.000Z' });
  const edits = [{ path: 'Button.tsx', operation: 'modify' }];
  const proposed = proposeCodeEdits(planApproval, edits);
  const authorized = approveCodeEdits(proposed, { planId: plan.id, planHash: proposed.planHash, contextSnapshotId: snapshot.id, contextDigest: snapshot.sourceDigest, editSetHash: createEditSetDigest(plan.id, edits), approvedBy: 'Pol', approvedAt: '2026-08-27T10:02:00.000Z' });
  assert.equal(assertImplementationAuthorized(authorized), true);
  assert.throws(() => approveCodeEdits(proposed, { planId: plan.id, planHash: '0'.repeat(64), contextSnapshotId: snapshot.id, contextDigest: snapshot.sourceDigest, editSetHash: proposed.editSetHash, approvedBy: 'Pol', approvedAt: '2026-08-27T10:02:00.000Z' }), /plan hash/);
});
