import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInitialPlan,
  validatePlanReview,
  validateUiReview,
  validateModelProposal,
  validateApprovalReceipt,
  validateEngineerResult
} from '../src/contracts.mjs';
import { createContextSnapshot } from '../src/context/context-snapshot.mjs';

test('validates shared planner, reviewer, and model contracts', () => {
  assert.equal(validateInitialPlan({ id: 'plan-1', goal: 'Add date picker', scope: {}, files: [], interfaces: [], risks: [], verification: [], libraryDecisions: [], approvalStatus: 'awaiting-approval' }).valid, true);
  assert.equal(validatePlanReview({ findings: [], reviewedPlan: { id: 'plan-1' }, recommendation: 'approve' }).valid, true);
  assert.equal(validateUiReview({ findings: [], verification: { checks: [] }, completion: 'pass' }).valid, true);
  const assignments = Object.fromEntries(['planner', 'planReviewer', 'engineer', 'uiReviewer', 'prWriter', 'orchestrator'].map((role) => [role, { model: 'gpt-5.6-luna', reasoning: 'medium' }]));
  assignments.prWriter = { model: 'gpt-5.6-luna', reasoning: 'light' };
  assert.equal(validateModelProposal({ proposalId: 'model-1', tier: 'terra', preset: 'recommended', assignments, selectionOptions: [], reasons: [], status: 'awaiting-confirmation' }).valid, true);
  assert.equal(validateApprovalReceipt({ planId: 'plan-1', planHash: 'a'.repeat(64), contextSnapshotId: 'b'.repeat(64), contextDigest: 'c'.repeat(64), editSetHash: 'd'.repeat(64), approvedBy: 'Pol', approvedAt: '2026-08-26T10:00:00.000Z' }, { requireEditSetHash: true }).valid, true);
});

test('rejects unsafe contract values', () => {
  assert.equal(validateInitialPlan({ id: 'plan-1', approvalStatus: 'approved' }).valid, false);
  assert.equal(validatePlanReview({ findings: [], recommendation: 'unknown' }).valid, false);
  assert.equal(validateUiReview({ findings: [], verification: {}, completion: 'unknown' }).valid, false);
  assert.equal(validateModelProposal({ proposalId: 'model-1', tier: 'unknown', assignments: {}, reasons: [], status: 'approved' }).valid, false);
  assert.equal(validateApprovalReceipt({ planId: 'plan-1', planHash: 'not-a-digest', approvedBy: 'Pol', approvedAt: 'now' }, { requireEditSetHash: true }).valid, false);
});

test('requires snapshot evidence for approval receipts and reapproval evidence for engineer results', () => {
  assert.equal(validateApprovalReceipt({
    planId: 'plan-1',
    planHash: 'a'.repeat(64),
    approvedBy: 'Pol',
    approvedAt: '2026-08-26T10:00:00.000Z'
  }).valid, false);
  assert.equal(validateApprovalReceipt({
    planId: 'plan-1',
    planHash: 'a'.repeat(64),
    contextSnapshotId: 'b'.repeat(64),
    contextDigest: 'c'.repeat(64),
    approvedBy: 'Pol',
    approvedAt: '2026-08-26T10:00:00.000Z'
  }, { requireEditSetHash: true }).valid, false);

  const contextSnapshot = createContextSnapshot({
    taskId: 'task-1',
    now: '2026-08-28T10:00:00.000Z',
    context: { selectedSources: [], gaps: [], ambiguities: [] }
  });
  assert.equal(validateEngineerResult({
    context: contextSnapshot,
    plan: { id: 'plan-1' },
    status: 'awaiting-context-reapproval',
    changedArtifacts: [],
    verification: { checks: [] },
    proposedLearningEntry: null
  }).valid, false);
});
