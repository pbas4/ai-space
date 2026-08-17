import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApprovalState,
  approvePlan,
  approveCodeEdits,
  assertImplementationAuthorized,
  ApprovalRequiredError
} from '../src/workflow/approval-gate.mjs';

test('requires plan approval before code-edit approval and implementation', () => {
  const initial = createApprovalState('plan-1', 'hash-1');
  assert.equal(initial.status, 'awaiting-plan-approval');
  assert.throws(() => approveCodeEdits(initial, { planId: 'plan-1', editSetHash: 'hash-1', approvedBy: 'user', approvedAt: 'now' }), ApprovalRequiredError);
  assert.throws(() => assertImplementationAuthorized(initial), ApprovalRequiredError);
});

test('matching plan and edit approvals authorize implementation', () => {
  const planned = approvePlan(createApprovalState('plan-1', 'hash-1'), { planId: 'plan-1', approvedBy: 'user', approvedAt: 'now' });
  const authorized = approveCodeEdits(planned, { planId: 'plan-1', editSetHash: 'hash-1', approvedBy: 'user', approvedAt: 'now' });
  assert.equal(authorized.status, 'authorized');
  assert.doesNotThrow(() => assertImplementationAuthorized(authorized));
});

test('rejects mismatched edit approvals and scope expansion', () => {
  const planned = approvePlan(createApprovalState('plan-1', 'hash-1'), { planId: 'plan-1', approvedBy: 'user', approvedAt: 'now' });
  assert.throws(() => approveCodeEdits(planned, { planId: 'plan-1', editSetHash: 'hash-2', approvedBy: 'user', approvedAt: 'now' }), /edit set/);
  assert.throws(() => approvePlan(planned, { planId: 'plan-2', approvedBy: 'user', approvedAt: 'now' }), /status/);
});
