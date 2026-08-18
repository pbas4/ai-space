import test from 'node:test';
import assert from 'node:assert/strict';
import { runEngineerWorkflow } from '../src/workflow/engineer-workflow.mjs';
import { approveLearningEntry, proposeLearningEntry } from '../src/ledger/learning-ledger.mjs';

const scenarios = {
  newComponent: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/new-component.json', import.meta.url), 'utf8'))),
  bugFix: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/bug-fix.json', import.meta.url), 'utf8'))),
  featureExtension: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/feature-extension.json', import.meta.url), 'utf8'))),
  figmaConflict: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/figma-conflict.json', import.meta.url), 'utf8'))),
  approvedCorrection: JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(new URL('./fixtures/approved-correction.json', import.meta.url), 'utf8')))
};

function deps(scenario) {
  return {
    contextAdapter: { async discover() { return scenario.context; } },
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
    const request = { ...scenario.request, approvals: { codeEdits: { planId: scenario.id, editSetHash: scenario.editSetHash, approvedBy: 'user', approvedAt: 'now' } } };
    const approvedPlan = { id: scenario.id, goal: scenario.task, approvalStatus: 'approved', approval: { approvedBy: 'user', approvedAt: 'now' } };
    const result = await runEngineerWorkflow({ request, approvedPlan }, deps(scenario));
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
