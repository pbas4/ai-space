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

test('requires plan approval before code-edit approval and implementation', () => {
  const plan = { id: 'plan-1', files: ['Button.tsx'], verification: ['jest Button.test.tsx'] };
  const initial = createApprovalState(plan);
  assert.equal(initial.status, 'awaiting-plan-approval');
  assert.throws(() => approveCodeEdits(initial, { planId: 'plan-1', planHash: createPlanDigest(plan), editSetHash: createEditSetDigest('plan-1', ['Button.tsx']), approvedBy: 'user', approvedAt: '2026-08-26T10:00:00.000Z' }), ApprovalRequiredError);
  assert.throws(() => assertImplementationAuthorized(initial), ApprovalRequiredError);
});

test('matching plan and edit approvals authorize implementation', () => {
  const plan = { id: 'plan-1', files: ['Button.tsx'] };
  const planned = proposeCodeEdits(approvePlan(createApprovalState(plan), { planId: 'plan-1', planHash: createPlanDigest(plan), approvedBy: 'user', approvedAt: '2026-08-26T10:00:00.000Z' }), ['Button.tsx']);
  const authorized = approveCodeEdits(planned, { planId: 'plan-1', planHash: createPlanDigest(plan), editSetHash: createEditSetDigest('plan-1', ['Button.tsx']), approvedBy: 'user', approvedAt: '2026-08-26T10:01:00.000Z' });
  assert.equal(authorized.status, 'authorized');
  assert.doesNotThrow(() => assertImplementationAuthorized(authorized));
});

test('rejects mutated plan content, incomplete receipts, and reordered edits', () => {
  const plan = { id: 'plan-1', files: ['Button.tsx'], verification: ['jest Button.test.tsx'] };
  const receipt = { planId: 'plan-1', planHash: createPlanDigest(plan), approvedBy: 'Pol', approvedAt: '2026-08-26T10:00:00.000Z' };
  const changedPlan = { ...plan, files: ['Button.tsx', 'Button.stories.tsx'] };
  assert.throws(() => approvePlan(createApprovalState(changedPlan), receipt), /plan hash/);

  const planned = proposeCodeEdits(approvePlan(createApprovalState(plan), receipt), ['Button.tsx']);
  assert.throws(() => approveCodeEdits(planned, { planId: 'plan-1', editSetHash: createEditSetDigest('plan-1', ['Button.tsx']), approvedBy: 'Pol', approvedAt: '2026-08-26T10:01:00.000Z' }), /plan hash/);
  assert.throws(() => approveCodeEdits(planned, { planId: 'plan-1', planHash: createPlanDigest(plan), editSetHash: createEditSetDigest('plan-1', ['Button.stories.tsx', 'Button.tsx']), approvedBy: 'Pol', approvedAt: '2026-08-26T10:01:00.000Z' }), /edit set/);
});
