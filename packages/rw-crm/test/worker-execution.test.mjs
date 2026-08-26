import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKER_ROLES, createWorkerExecution } from '../src/workflow/worker-execution.mjs';

test('creates an immutable execution context for a known worker role', () => {
  const execution = createWorkerExecution({
    proposalId: 'model:Fix Button',
    role: 'planner',
    assignment: { model: 'gpt-5.6-luna', reasoning: 'high' },
    approvedAt: 'now'
  });

  assert.deepEqual(WORKER_ROLES, ['planner', 'planReviewer', 'engineer', 'uiReviewer', 'prWriter']);
  assert.deepEqual(execution, {
    proposalId: 'model:Fix Button',
    role: 'planner',
    model: 'gpt-5.6-luna',
    reasoning: 'high',
    approvedAt: 'now',
    escalation: null
  });
  assert.equal(Object.isFrozen(execution), true);
});
