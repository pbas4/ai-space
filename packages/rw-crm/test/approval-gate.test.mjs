import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApprovalState,
  createEditSetDigest,
  createPlanDigest,
  proposeCodeEdits,
  approvePlan,
  approveCodeEdits,
  assertImplementationAuthorized,
  ApprovalRequiredError
} from '../src/workflow/approval-gate.mjs';
import { createContextSnapshot } from '../src/context/context-snapshot.mjs';

const contextSnapshot = createContextSnapshot({
  taskId: 'plan-1',
  now: '2026-08-26T09:00:00.000Z',
  context: { selectedSources: [], gaps: [], ambiguities: [] }
});

test('requires plan approval before code-edit approval and implementation', () => {
  const plan = { id: 'plan-1', files: ['Button.tsx'], verification: ['jest Button.test.tsx'] };
  const initial = createApprovalState(plan, contextSnapshot);
  assert.equal(initial.status, 'awaiting-plan-approval');
  assert.throws(() => approveCodeEdits(initial, { planId: 'plan-1', planHash: createPlanDigest(plan, contextSnapshot), contextSnapshotId: contextSnapshot.id, contextDigest: contextSnapshot.sourceDigest, editSetHash: createEditSetDigest('plan-1', ['Button.tsx']), approvedBy: 'user', approvedAt: '2026-08-26T10:00:00.000Z' }), ApprovalRequiredError);
  assert.throws(() => assertImplementationAuthorized(initial), ApprovalRequiredError);
});

test('matching plan and edit approvals authorize implementation', () => {
  const plan = { id: 'plan-1', files: ['Button.tsx'] };
  const planHash = createPlanDigest(plan, contextSnapshot);
  const receipt = { planId: 'plan-1', planHash, contextSnapshotId: contextSnapshot.id, contextDigest: contextSnapshot.sourceDigest, approvedBy: 'user', approvedAt: '2026-08-26T10:00:00.000Z' };
  const planned = proposeCodeEdits(approvePlan(createApprovalState(plan, contextSnapshot), receipt), ['Button.tsx']);
  const authorized = approveCodeEdits(planned, { ...receipt, editSetHash: createEditSetDigest('plan-1', ['Button.tsx']), approvedAt: '2026-08-26T10:01:00.000Z' });
  assert.equal(authorized.status, 'authorized');
  assert.equal(authorized.contextSnapshotId, contextSnapshot.id);
  assert.equal(authorized.contextDigest, contextSnapshot.sourceDigest);
  assert.doesNotThrow(() => assertImplementationAuthorized(authorized));
});

test('rejects receipts that are not bound to the current context snapshot', () => {
  const plan = { id: 'plan-1', files: ['Button.tsx'] };
  const changedSnapshot = { ...contextSnapshot, id: 'b'.repeat(64), sourceDigest: 'c'.repeat(64) };
  const receipt = {
    planId: 'plan-1',
    planHash: createPlanDigest(plan, contextSnapshot),
    contextSnapshotId: contextSnapshot.id,
    contextDigest: contextSnapshot.sourceDigest,
    approvedBy: 'user',
    approvedAt: '2026-08-26T10:00:00.000Z'
  };

  assert.throws(() => approvePlan(createApprovalState(plan, changedSnapshot), receipt), /plan hash|context snapshot/);
});

test('rejects mutated plan content, incomplete receipts, and reordered edits', () => {
  const plan = { id: 'plan-1', files: ['Button.tsx'], verification: ['jest Button.test.tsx'] };
  const receipt = { planId: 'plan-1', planHash: createPlanDigest(plan, contextSnapshot), contextSnapshotId: contextSnapshot.id, contextDigest: contextSnapshot.sourceDigest, approvedBy: 'Pol', approvedAt: '2026-08-26T10:00:00.000Z' };
  const changedPlan = { ...plan, files: ['Button.tsx', 'Button.stories.tsx'] };
  assert.throws(() => approvePlan(createApprovalState(changedPlan, contextSnapshot), receipt), /plan hash/);

  const planned = proposeCodeEdits(approvePlan(createApprovalState(plan, contextSnapshot), receipt), ['Button.tsx']);
  assert.throws(() => approveCodeEdits(planned, { planId: 'plan-1', editSetHash: createEditSetDigest('plan-1', ['Button.tsx']), contextSnapshotId: contextSnapshot.id, contextDigest: contextSnapshot.sourceDigest, approvedBy: 'Pol', approvedAt: '2026-08-26T10:01:00.000Z' }), /plan hash/);
  assert.throws(() => approveCodeEdits(planned, { planId: 'plan-1', planHash: createPlanDigest(plan, contextSnapshot), contextSnapshotId: contextSnapshot.id, contextDigest: contextSnapshot.sourceDigest, editSetHash: createEditSetDigest('plan-1', ['Button.stories.tsx', 'Button.tsx']), approvedBy: 'Pol', approvedAt: '2026-08-26T10:01:00.000Z' }), /edit set/);
});
