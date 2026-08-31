import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHeartbeatRun } from '../src/automation/heartbeat-controller.mjs';

const plan = { tasks: [{ id: 'task-1', status: 'unchecked' }, { id: 'task-2', status: 'unchecked' }] };
const ready = { plan, repoState: { clean: true }, approvals: { plan: true, codeEdits: true }, workflowState: { contextChanged: false, testsPassed: true } };

test('selects exactly one eligible unchecked task', () => {
  assert.deepEqual(evaluateHeartbeatRun(ready), { action: 'execute-one-task', taskId: 'task-1', reason: 'next unchecked task is eligible', nextRun: 'after-verification' });
});

test('stops on invalid or completed plans', () => {
  assert.equal(evaluateHeartbeatRun({ ...ready, plan: null }).action, 'blocked');
  assert.equal(evaluateHeartbeatRun({ ...ready, plan: { tasks: [{ id: 'task-1', status: 'complete' }] } }).action, 'complete');
});

test('stops before work for unrelated changes, policy rejection, context change, or failed verification', () => {
  assert.equal(evaluateHeartbeatRun({ ...ready, repoState: { clean: false, unrelatedChanges: true } }).action, 'blocked');
  assert.equal(evaluateHeartbeatRun({ ...ready, repoState: { clean: true, sourcePolicyRejected: true } }).action, 'blocked');
  assert.equal(evaluateHeartbeatRun({ ...ready, workflowState: { contextChanged: true, testsPassed: true } }).action, 'awaiting-approval');
  assert.equal(evaluateHeartbeatRun({ ...ready, workflowState: { contextChanged: false, testsPassed: false } }).action, 'blocked');
});

test('stops for missing approvals and never schedules another run', () => {
  assert.equal(evaluateHeartbeatRun({ ...ready, approvals: {} }).action, 'awaiting-approval');
  assert.equal(evaluateHeartbeatRun({ ...ready, approvals: { plan: true } }).action, 'awaiting-approval');
  assert.equal(evaluateHeartbeatRun({ ...ready, repoState: { clean: false } }).nextRun, null);
});
