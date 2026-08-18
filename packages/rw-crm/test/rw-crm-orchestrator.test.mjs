import test from 'node:test';
import assert from 'node:assert/strict';
import { runRwCrmOrchestrator } from '../src/workflow/rw-crm-orchestrator.mjs';

const request = { task: 'Fix Button', componentScope: ['Button'], figmaLinks: [], constraints: [], environment: 'standalone' };
const plan = { id: 'plan:Fix Button', goal: 'Fix Button', scope: {}, files: ['Button'], interfaces: ['Button API'], risks: [], verification: ['unit'], libraryDecisions: [], approvalStatus: 'awaiting-approval' };
function deps(calls) {
  return {
    contextAdapter: { async discover() { return { gaps: [], ambiguities: [] }; } },
    planner: async () => { calls.push('planner'); return { context: {}, plan, proposedLearningEntry: null }; },
    planReviewer: async () => { calls.push('reviewer'); return { findings: [], reviewedPlan: plan, recommendation: 'approve', proposedLearningEntry: null }; },
    engineer: async () => { calls.push('engineer'); return { status: 'implemented', changedArtifacts: ['Button.mjs'], verification: { checks: [] } }; },
    uiReviewer: async () => { calls.push('ui-reviewer'); return { findings: [], verification: { checks: [] }, completion: 'pass' }; }
  };
}
function modelApproval() { return { proposalId: 'model:Fix Button', assignments: {}, approvedBy: 'user', approvedAt: 'now' }; }

test('pauses before every subagent until model confirmation', async () => {
  const calls = [];
  const result = await runRwCrmOrchestrator(request, deps(calls));
  assert.equal(result.status, 'awaiting-model-approval');
  assert.deepEqual(calls, []);
});

test('runs standalone planner, reviewer, engineer, then UI review after approvals', async () => {
  const calls = [];
  const approvedPlan = { ...plan, approvalStatus: 'approved', approval: { approvedBy: 'user', approvedAt: 'now' } };
  const result = await runRwCrmOrchestrator({ ...request, modelApproval: modelApproval(), approvedPlan, approvals: { codeEdits: { planId: plan.id, editSetHash: 'h', approvedBy: 'user', approvedAt: 'now' } } }, deps(calls));
  assert.equal(result.status, 'complete');
  assert.deepEqual(calls, ['planner', 'reviewer', 'engineer', 'ui-reviewer']);
});

test('delegates plugin plan review and skips package work for non-UI tasks', async () => {
  const pluginCalls = [];
  const plugin = await runRwCrmOrchestrator({ ...request, environment: 'create-task-plan-plugin', modelApproval: modelApproval() }, deps(pluginCalls));
  assert.equal(plugin.status, 'awaiting-plugin-plan-review');
  assert.deepEqual(pluginCalls, ['planner']);
  const skipped = await runRwCrmOrchestrator({ task: 'Update database index', figmaLinks: [], environment: 'standalone' }, deps([]));
  assert.equal(skipped.status, 'skipped');
});
