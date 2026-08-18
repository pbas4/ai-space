import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask, proposeModelExecution, approveModelExecution, requestModelEscalation } from '../src/routing/model-router.mjs';

test('classifies simple, standard, and complex tasks', () => {
  assert.equal(classifyTask({ task: 'Change button copy', componentScope: ['Button'] }, {}).tier, 'luna');
  assert.equal(classifyTask({ task: 'Fix DatePicker keyboard behavior', componentScope: ['DatePicker'], repositoryScope: ['a', 'b'] }, {}).tier, 'terra');
  assert.equal(classifyTask({ task: 'Create component', figmaLinks: ['figma://x'], componentScope: ['DatePicker'], constraints: ['accessibility'] }, { ambiguities: [{ topic: 'radius' }] }).tier, 'sol');
});

test('requires explicit confirmation for execution and escalation', () => {
  const proposal = proposeModelExecution({ task: 'Fix bug' }, { tier: 'terra', reasons: ['multi-file'], escalationTriggers: [] });
  assert.equal(proposal.status, 'awaiting-confirmation');
  const approved = approveModelExecution(proposal, { proposalId: proposal.proposalId, assignments: proposal.assignments, approvedBy: 'user', approvedAt: 'now' });
  assert.equal(approved.status, 'approved');
  const escalation = requestModelEscalation(approved, 'sol', 'Figma conflict');
  assert.equal(escalation.status, 'awaiting-confirmation');
  assert.equal(approved.tier, 'terra');
});
