import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewPlan } from '../src/planning/plan-reviewer.mjs';

const completePlan = { id: 'p1', goal: 'Add DatePicker', scope: {}, files: ['a'], interfaces: ['DatePicker API'], risks: [], verification: ['unit'], libraryDecisions: [], approvalStatus: 'awaiting-approval' };
const context = { gaps: [], ambiguities: [], libraryDecisions: [] };

test('approves a complete plan without mutating it', async () => {
  const original = structuredClone(completePlan);
  const result = await reviewPlan({ request: { task: 'Add DatePicker' }, initialPlan: completePlan }, { contextAdapter: { async discover() { return context; } }, checklist: [], ledger: { async consult() { return []; } } });
  assert.equal(result.recommendation, 'approve');
  assert.deepEqual(result.reviewedPlan, original);
  assert.deepEqual(completePlan, original);
});

test('blocks missing context and flags library conflicts and missing verification', async () => {
  const result = await reviewPlan({ request: { task: 'Add DatePicker' }, initialPlan: { ...completePlan, verification: [], libraryDecisions: [{ figma: '8px', library: '4px', authority: 'ui-library' }] } }, {
    contextAdapter: { async discover() { return { gaps: [{ reason: 'missing code' }], ambiguities: [], libraryDecisions: [] }; } }, checklist: [], ledger: { async consult() { return []; } }
  });
  assert.equal(result.recommendation, 'blocked');
  assert.ok(result.findings.some((finding) => finding.category === 'context' && finding.blocking));
  assert.ok(result.findings.some((finding) => finding.category === 'library-decision'));
  assert.ok(result.findings.some((finding) => finding.category === 'verification'));
});
