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
  const acceptedAll = approveModelExecution(proposal, { proposalId: proposal.proposalId, acceptAll: true, approvedBy: 'user', approvedAt: 'now' });
  assert.deepEqual(acceptedAll.assignments, proposal.assignments);
  assert.throws(() => approveModelExecution(proposal, { proposalId: proposal.proposalId, assignments: {}, approvedBy: 'user', approvedAt: 'now' }), /assignments/);
  assert.throws(() => approveModelExecution(proposal, { proposalId: proposal.proposalId, assignments: { ...proposal.assignments, prWriter: { model: 'gpt-5.6-sol', reasoning: 'high' } }, approvedBy: 'user', approvedAt: 'now' }), /PR Description Writer/);
});

test('offers native-selectable Light, Medium, High, and Recommended model modes', () => {
  const classification = { tier: 'terra', reasons: ['standard work'], escalationTriggers: [] };
  const proposal = proposeModelExecution({ task: 'Fix Button' }, classification);

  assert.deepEqual(proposal.selectionOptions.map((option) => option.value), ['recommended', 'light', 'medium', 'high', 'individual']);
  assert.equal(proposal.selectionOptions[0].nativePrompt, true);

  const light = proposeModelExecution({ task: 'Fix Button' }, classification, undefined, 'light');
  assert.deepEqual(light.assignments, {
    planner: { model: 'gpt-5.6-luna', reasoning: 'high' },
    planReviewer: { model: 'gpt-5.6-luna', reasoning: 'medium' },
    engineer: { model: 'gpt-5.6-luna', reasoning: 'medium' },
    uiReviewer: { model: 'gpt-5.6-luna', reasoning: 'medium' },
    prWriter: { model: 'gpt-5.6-luna', reasoning: 'light' },
    orchestrator: { model: 'gpt-5.6-luna', reasoning: 'medium' }
  });

  const medium = proposeModelExecution({ task: 'Fix Button' }, classification, undefined, 'medium');
  assert.equal(medium.assignments.planner.model, 'gpt-5.6-terra');
  assert.equal(medium.assignments.planner.reasoning, 'high');
  assert.equal(medium.assignments.planReviewer.model, 'gpt-5.6-luna');
  assert.equal(medium.assignments.orchestrator.model, 'gpt-5.6-luna');

  const high = proposeModelExecution({ task: 'Fix Button' }, classification, undefined, 'high');
  assert.equal(high.assignments.planner.model, 'gpt-5.6-sol');
  assert.equal(high.assignments.planReviewer.reasoning, 'high');
  assert.equal(high.assignments.engineer.model, 'gpt-5.6-sol');
  assert.equal(high.assignments.engineer.reasoning, 'medium');
  assert.equal(high.assignments.uiReviewer.reasoning, 'high');
});
