import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInitialPlan,
  validatePlanReview,
  validateUiReview,
  validateModelProposal
} from '../src/contracts.mjs';

test('validates shared planner, reviewer, and model contracts', () => {
  assert.equal(validateInitialPlan({ id: 'plan-1', goal: 'Add date picker', scope: {}, files: [], interfaces: [], risks: [], verification: [], libraryDecisions: [], approvalStatus: 'awaiting-approval' }).valid, true);
  assert.equal(validatePlanReview({ findings: [], reviewedPlan: { id: 'plan-1' }, recommendation: 'approve' }).valid, true);
  assert.equal(validateUiReview({ findings: [], verification: { checks: [] }, completion: 'pass' }).valid, true);
  assert.equal(validateModelProposal({ proposalId: 'model-1', tier: 'terra', assignments: {}, reasons: [], status: 'awaiting-confirmation' }).valid, true);
});

test('rejects unsafe contract values', () => {
  assert.equal(validateInitialPlan({ id: 'plan-1', approvalStatus: 'approved' }).valid, false);
  assert.equal(validatePlanReview({ findings: [], recommendation: 'unknown' }).valid, false);
  assert.equal(validateUiReview({ findings: [], verification: {}, completion: 'unknown' }).valid, false);
  assert.equal(validateModelProposal({ proposalId: 'model-1', tier: 'unknown', assignments: {}, reasons: [], status: 'approved' }).valid, false);
});
