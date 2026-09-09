import test from 'node:test';
import assert from 'node:assert/strict';
import { runRwCrmOrchestrator } from '../src/workflow/rw-crm-orchestrator.mjs';
import { createContextSnapshot } from '../src/context/context-snapshot.mjs';

const request = { task: 'Fix Button', componentScope: ['Button'], figmaLinks: [], constraints: [], environment: 'standalone' };
const plan = { id: 'plan:Fix Button', goal: 'Fix Button', scope: {}, files: ['Button'], interfaces: ['Button API'], risks: [], verification: ['unit'], libraryDecisions: [], approvalStatus: 'awaiting-approval' };
function deps(calls, { executions = [], plannerResult = null } = {}) {
  return {
    contextAdapter: { async discover() { return { gaps: [], ambiguities: [] }; } },
    planner: async (_request, execution) => { calls.push('planner'); executions.push(['planner', execution]); return plannerResult ?? { context: {}, plan, proposedLearningEntry: null }; },
    planReviewer: async (_input, execution) => { calls.push('reviewer'); executions.push(['planReviewer', execution]); return { findings: [], reviewedPlan: plan, recommendation: 'approve', proposedLearningEntry: null }; },
    engineer: async (_input, execution) => { calls.push('engineer'); executions.push(['engineer', execution]); return { status: 'implemented', changedArtifacts: ['Button.mjs'], verification: { checks: [] } }; },
    uiReviewer: async (_input, execution) => { calls.push('ui-reviewer'); executions.push(['uiReviewer', execution]); return { findings: [], verification: { checks: [] }, completion: 'pass' }; },
    prWriter: async (_input, execution) => { calls.push('pr-writer'); executions.push(['prWriter', execution]); return { title: 'Fix Button', body: '## Summary' }; }
  };
}
function modelApproval() { return { proposalId: 'model:Fix Button', acceptAll: true, approvedBy: 'user', approvedAt: 'now' }; }

test('creates one context snapshot and shares it with every workflow worker', async () => {
  const calls = [];
  const workerInputs = [];
  let discoveries = 0;
  const context = {
    selectedSources: [{ id: 'library:button', kind: 'ui-library', uri: 'storybook://Button', body: 'v1' }],
    scope: { components: ['Button'], screens: [], routes: [] },
    libraryDecisions: [{ topic: 'radius', figma: '8px', library: '4px', authority: 'ui-library', decision: 'use 4px' }],
    gaps: [],
    ambiguities: []
  };
  const contextAdapter = {
    async discover() { discoveries += 1; return context; },
    async refresh(snapshot) { return { snapshot, comparison: { material: false, changes: [] } }; }
  };
  const approvedPlan = { ...plan, approvalStatus: 'approved', approval: { approvedBy: 'user', approvedAt: 'now' } };
  const workflowDeps = deps(calls);
  for (const role of ['planner', 'planReviewer', 'engineer', 'uiReviewer', 'prWriter']) {
    const worker = workflowDeps[role];
    workflowDeps[role] = async (input, execution) => {
      workerInputs.push([role, input]);
      return worker(input, execution);
    };
  }

  const result = await runRwCrmOrchestrator({
    ...request,
    modelApproval: modelApproval(),
    approvedPlan,
    approvals: { codeEdits: { planId: plan.id, editSetHash: 'h', approvedBy: 'user', approvedAt: 'now' } }
  }, { ...workflowDeps, contextAdapter, clock: () => '2026-08-28T10:00:00.000Z' });

  assert.equal(result.status, 'complete');
  assert.equal(discoveries, 1);
  assert.equal(result.engineer.contextSnapshot.id, result.planner.contextSnapshot.id);
  assert.deepEqual(workerInputs.map(([, input]) => input.contextSnapshot.id), Array(5).fill(result.planner.contextSnapshot.id));
  assert.deepEqual(workerInputs.map(([, input]) => input.contextSnapshot.scope), Array(5).fill(context.scope));
  assert.deepEqual(workerInputs.map(([, input]) => input.contextSnapshot.libraryDecisions), Array(5).fill(context.libraryDecisions));
});

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
  assert.deepEqual(calls, ['planner', 'reviewer', 'engineer', 'ui-reviewer', 'pr-writer']);
});

test('delegates plugin plan review and skips package work for non-UI tasks', async () => {
  const pluginCalls = [];
  const plugin = await runRwCrmOrchestrator({ ...request, environment: 'create-task-plan-plugin', modelApproval: modelApproval() }, deps(pluginCalls));
  assert.equal(plugin.status, 'awaiting-plugin-plan-review');
  assert.deepEqual(pluginCalls, ['planner']);
  const skipped = await runRwCrmOrchestrator({ task: 'Update database index', figmaLinks: [], environment: 'standalone' }, deps([]));
  assert.equal(skipped.status, 'skipped');
});

test('passes the approved model assignment to every invoked worker', async () => {
  const calls = [];
  const executions = [];
  const approvedPlan = { ...plan, approvalStatus: 'approved', approval: { approvedBy: 'user', approvedAt: 'now' } };
  const result = await runRwCrmOrchestrator({
    ...request,
    modelSelection: { preset: 'light' },
    modelApproval: modelApproval(),
    approvedPlan,
    approvals: { codeEdits: { planId: plan.id, editSetHash: 'h', approvedBy: 'user', approvedAt: 'now' } }
  }, deps(calls, { executions }));

  assert.equal(result.status, 'complete');
  assert.deepEqual(executions.map(([role]) => role), ['planner', 'planReviewer', 'engineer', 'uiReviewer', 'prWriter']);
  assert.deepEqual(executions[0][1], {
    proposalId: 'model:Fix Button',
    role: 'planner',
    model: 'gpt-5.6-luna',
    reasoning: 'high',
    approvedAt: 'now',
    escalation: null
  });
});

test('pauses before the next worker when a worker requests escalation', async () => {
  const calls = [];
  const result = await runRwCrmOrchestrator({ ...request, modelApproval: modelApproval() }, deps(calls, {
    plannerResult: { context: {}, plan, modelEscalation: { target: 'sol', reason: 'Figma conflict' } }
  }));
  assert.equal(result.status, 'awaiting-model-escalation');
  assert.deepEqual(calls, ['planner']);
  assert.equal(result.modelEscalation.to, 'sol');
});
