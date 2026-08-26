import test from 'node:test';
import assert from 'node:assert/strict';
import { runEngineerWorkflow } from '../src/workflow/engineer-workflow.mjs';
import { createEditSetDigest, createPlanDigest } from '../src/workflow/approval-gate.mjs';

const request = {
  task: 'Add DatePicker',
  componentScope: ['DatePicker'],
  repositoryScope: ['packages/ui'],
  figmaLinks: ['figma://date-picker'],
  constraints: [],
  approvals: {}
};
const approvedPlan = { id: 'plan-1', goal: 'Add DatePicker', approvalStatus: 'approved' };
const approvedAt = '2026-08-26T10:00:00.000Z';
const planReceipt = { planId: 'plan-1', planHash: createPlanDigest(approvedPlan), approvedBy: 'user', approvedAt };
const codeReceipt = { planId: 'plan-1', planHash: createPlanDigest(approvedPlan), editSetHash: createEditSetDigest('plan-1', ['packages/ui/DatePicker.mjs']), approvedBy: 'user', approvedAt: '2026-08-26T10:01:00.000Z' };

function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    contextAdapter: {
      async discover() {
        calls.push('context');
        return {
          scope: { components: ['DatePicker'], screens: [], routes: [] },
          sources: [{ id: 'library:date-picker', kind: 'ui-library', uri: 'storybook://DatePicker', freshness: 'fresh' }],
          evidence: [], gaps: [], ambiguities: [],
          libraryDecisions: [{ topic: 'radius', figma: '8px', library: '4px', authority: 'ui-library', decision: 'use 4px' }]
        };
      }
    },
    implementationAdapter: {
      async propose() { calls.push('propose'); return { id: 'plan-1', summary: 'Add DatePicker', editSetHash: 'hash-1', edits: ['packages/ui/DatePicker.mjs'] }; },
      async apply() { calls.push('apply'); return ['packages/ui/DatePicker.mjs']; }
    },
    verifier: { async run() { calls.push('verify'); return { checks: [{ name: 'unit', status: 'passed', evidence: 'ok' }] }; } },
    ledger: { version: 1, entries: [], proposals: [] },
    ...overrides
  };
}

test('consumes an approved plan and never applies edits before both approvals', async () => {
  const firstDeps = deps();
  const proposed = await runEngineerWorkflow({ request, approvedPlan }, firstDeps);
  assert.equal(proposed.status, 'awaiting-plan-approval');
  assert.deepEqual(firstDeps.calls, ['context']);

  const rejected = await runEngineerWorkflow({ request, approvedPlan: { ...approvedPlan, approvalStatus: 'awaiting-approval' } }, deps());
  assert.equal(rejected.status, 'awaiting-plan-approval');

  const authorizedDeps = deps();
  const implemented = await runEngineerWorkflow({ request: { ...request, approvals: { plan: planReceipt, codeEdits: codeReceipt } }, approvedPlan }, authorizedDeps);
  assert.equal(implemented.status, 'implemented');
  assert.deepEqual(authorizedDeps.calls, ['context', 'propose', 'apply', 'verify']);
});

test('does not trust an approval embedded in the plan or a stale receipt', async () => {
  const embedded = { ...approvedPlan, approval: { approvedBy: 'user', approvedAt } };
  const noRequestApproval = await runEngineerWorkflow({ request, approvedPlan: embedded }, deps());
  assert.equal(noRequestApproval.status, 'awaiting-plan-approval');

  const stalePlan = { ...approvedPlan, files: ['DatePicker.tsx'] };
  const stale = await runEngineerWorkflow({ request: { ...request, approvals: { plan: planReceipt } }, approvedPlan: stalePlan }, deps());
  assert.equal(stale.status, 'awaiting-plan-approval');
});

test('blocks implementation when context is missing and surfaces library authority decisions', async () => {
  const blocked = await runEngineerWorkflow({ request, approvedPlan }, deps({ contextAdapter: { async discover() { return { scope: {}, sources: [], evidence: [], gaps: [{ reason: 'missing code', impact: 'cannot edit' }], ambiguities: [], libraryDecisions: [] }; } } }));
  assert.equal(blocked.status, 'needs-context');
  assert.deepEqual(blocked.changedArtifacts, []);
  assert.equal(blocked.verification.checks.length, 0);

  const conflict = await runEngineerWorkflow({ request, approvedPlan }, deps());
  assert.equal(conflict.context.libraryDecisions[0].authority, 'ui-library');
});
