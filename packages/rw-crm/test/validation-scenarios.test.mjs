import test from 'node:test';
import assert from 'node:assert/strict';
import { runEngineerWorkflow } from '../src/workflow/engineer-workflow.mjs';
import { approveLearningEntry, proposeLearningEntry } from '../src/ledger/learning-ledger.mjs';
import { classifyTask, proposeModelExecution, requestModelEscalation } from '../src/routing/model-router.mjs';
import { routeUiTask } from '../src/routing/ui-task-router.mjs';
import { reviewImplementation } from '../src/review/ui-reviewer.mjs';
import { createEditSetDigest, createPlanDigest } from '../src/workflow/approval-gate.mjs';
import { createContextSnapshot } from '../src/context/context-snapshot.mjs';

const scenarios = {
  newComponent: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/new-component.json', import.meta.url), 'utf8'))),
  bugFix: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/bug-fix.json', import.meta.url), 'utf8'))),
  featureExtension: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/feature-extension.json', import.meta.url), 'utf8'))),
  figmaConflict: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/figma-conflict.json', import.meta.url), 'utf8'))),
  approvedCorrection: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/approved-correction.json', import.meta.url), 'utf8')))
};

function deps(scenario) {
  return {
    contextAdapter: {
      async discover() { return scenario.context; },
      async refresh(snapshot) { return { snapshot, comparison: { material: false, changes: [] } }; }
    },
    implementationAdapter: {
      async propose() { return { id: scenario.id, summary: scenario.task, editSetHash: scenario.editSetHash, edits: scenario.edits }; },
      async apply(plan, edits) { return [...edits]; }
    },
    verifier: { async run(scope, changedArtifacts) { return { checks: [{ name: 'scenario', status: 'passed', evidence: `${scope.join(',')}:${changedArtifacts.join(',')}` }] }; } },
    ledger: { version: 1, entries: [], proposals: [] }
  };
}

for (const [name, scenario] of Object.entries(scenarios).slice(0, 4)) {
  test(`${name} scenario implements only after both approvals`, async () => {
    const approvedPlan = { id: scenario.id, goal: scenario.task, approvalStatus: 'approved' };
    const contextSnapshot = createContextSnapshot({
      taskId: scenario.request.task,
      context: scenario.context,
      now: '2026-08-26T09:00:00.000Z'
    });
    const planHash = createPlanDigest(approvedPlan, contextSnapshot);
    const request = {
      ...scenario.request,
      approvals: {
        plan: { planId: scenario.id, planHash, contextSnapshotId: contextSnapshot.id, contextDigest: contextSnapshot.sourceDigest, approvedBy: 'user', approvedAt: '2026-08-26T10:00:00.000Z' },
        codeEdits: { planId: scenario.id, planHash, contextSnapshotId: contextSnapshot.id, contextDigest: contextSnapshot.sourceDigest, editSetHash: createEditSetDigest(scenario.id, scenario.edits), approvedBy: 'user', approvedAt: '2026-08-26T10:01:00.000Z' }
      }
    };
    const result = await runEngineerWorkflow({ request, approvedPlan, contextSnapshot }, deps(scenario));
    assert.equal(result.status, 'implemented');
    assert.deepEqual(result.changedArtifacts, scenario.edits);
    assert.equal(result.verification.checks[0].status, 'passed');
  });
}

test('approved correction persists one ledger entry while unapproved correction does not', () => {
  const scenario = scenarios.approvedCorrection;
  const initial = { version: 1, entries: [], proposals: [] };
  const proposed = proposeLearningEntry(initial, scenario.correction);
  assert.equal(proposed.ledger.entries.length, 0);
  const rejected = { ...proposed.ledger, proposals: [] };
  assert.equal(rejected.entries.length, 0);
  const approved = approveLearningEntry(proposed.ledger, proposed.proposal.id, 'now');
  assert.equal(approved.ledger.entries.length, 1);
  assert.equal(approved.ledger.entries[0].persisted, true);
});

test('simple task receives a Luna proposal and an escalation remains unapproved', () => {
  const request = { task: 'Change button copy', componentScope: ['Button'], figmaLinks: [], constraints: [] };
  const classification = classifyTask(request, { gaps: [], ambiguities: [] });
  const proposal = proposeModelExecution(request, classification);
  assert.equal(classification.tier, 'luna');
  assert.equal(proposal.assignments.engineer.model, 'gpt-5.6-luna');
  assert.equal(requestModelEscalation(proposal, 'sol', 'scope expanded').status, 'awaiting-confirmation');
});

test('plugin UI task routes to the package while a non-UI task is skipped unless explicit', () => {
  assert.equal(routeUiTask({ task: 'Add DatePicker', figmaLinks: ['figma://date-picker'] }).invoke, true);
  assert.equal(routeUiTask({ task: 'Update database index', figmaLinks: [] }).invoke, false);
  assert.equal(routeUiTask({ task: 'Update database index', figmaLinks: [], explicitInvocation: true }).invoke, true);
});

test('critical UI findings block completion while advisory findings remain report-only', async () => {
  const base = { request: { task: 'Fix Button' }, approvedPlan: { id: 'p1' }, changedArtifacts: ['Button.mjs'] };
  const critical = await reviewImplementation(base, { contextAdapter: { async discover() { return { libraryDecisions: [] }; } }, evidenceAdapter: { async inspect() { return { findings: [{ severity: 'critical', message: 'Keyboard trap' }], checks: [] }; } }, checklist: [] });
  const advisory = await reviewImplementation(base, { contextAdapter: { async discover() { return { libraryDecisions: [] }; } }, evidenceAdapter: { async inspect() { return { findings: [{ severity: 'low', message: 'Copy' }], checks: [] }; } }, checklist: [] });
  assert.equal(critical.completion, 'blocked');
  assert.equal(advisory.completion, 'pass-with-findings');
});
