const DEFAULTS = {
  planner: { model: 'gpt-5.6-sol', reasoning: 'high' },
  planReviewer: { model: 'gpt-5.6-terra', reasoning: 'high' },
  engineer: { model: 'gpt-5.6-sol', reasoning: 'high' },
  uiReviewer: { model: 'gpt-5.6-terra', reasoning: 'high' },
  prWriter: { model: 'gpt-5.6-luna', reasoning: 'light' },
  orchestrator: { model: 'gpt-5.6-luna', reasoning: 'medium' }
};

const MODEL_ASSIGNMENT_ROLES = Object.freeze(['planner', 'planReviewer', 'engineer', 'uiReviewer', 'prWriter', 'orchestrator']);
const ALLOWED_MODELS = new Set(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']);
const ALLOWED_REASONING = new Set(['light', 'medium', 'high']);

const SELECTION_OPTIONS = [
  { value: 'recommended', label: 'Recommended', description: 'Automatically choose models from task complexity and context.', nativePrompt: true },
  { value: 'light', label: 'Light', description: 'Luna for the whole workflow with focused reasoning.', nativePrompt: true },
  { value: 'medium', label: 'Medium', description: 'Terra for core work and Luna for supporting review/orchestration.', nativePrompt: true },
  { value: 'high', label: 'High', description: 'Sol for analysis and implementation with high analytical reasoning.', nativePrompt: true },
  { value: 'individual', label: 'Individual agents', description: 'Choose the model and reasoning for each agent separately.', nativePrompt: true }
];

function presetAssignments(preset) {
  const common = { prWriter: { model: 'gpt-5.6-luna', reasoning: 'light' }, orchestrator: { model: 'gpt-5.6-luna', reasoning: 'medium' } };
  if (preset === 'light') return {
    planner: { model: 'gpt-5.6-luna', reasoning: 'high' },
    planReviewer: { model: 'gpt-5.6-luna', reasoning: 'medium' },
    engineer: { model: 'gpt-5.6-luna', reasoning: 'medium' },
    uiReviewer: { model: 'gpt-5.6-luna', reasoning: 'medium' },
    ...common
  };
  if (preset === 'medium') return {
    planner: { model: 'gpt-5.6-terra', reasoning: 'high' },
    planReviewer: { model: 'gpt-5.6-luna', reasoning: 'medium' },
    engineer: { model: 'gpt-5.6-terra', reasoning: 'high' },
    uiReviewer: { model: 'gpt-5.6-terra', reasoning: 'high' },
    ...common
  };
  if (preset === 'high') return {
    planner: { model: 'gpt-5.6-sol', reasoning: 'high' },
    planReviewer: { model: 'gpt-5.6-sol', reasoning: 'high' },
    engineer: { model: 'gpt-5.6-sol', reasoning: 'medium' },
    uiReviewer: { model: 'gpt-5.6-sol', reasoning: 'high' },
    ...common
  };
  return null;
}

export function classifyTask(request, contextSummary = {}) {
  const reasons = [];
  if (contextSummary.ambiguities?.length || contextSummary.gaps?.length || request.figmaLinks?.length || request.constraints?.includes('accessibility')) {
    reasons.push('ambiguous, design-linked, or accessibility-sensitive work');
    return { tier: 'sol', reasons, escalationTriggers: ['ambiguity', 'conflict', 'failed-verification'] };
  }
  if ((request.repositoryScope?.length ?? 0) > 1 || /fix|feature|extend/i.test(request.task ?? '')) {
    reasons.push('standard multi-file or behavior work');
    return { tier: 'terra', reasons, escalationTriggers: ['scope-expansion', 'context-gap'] };
  }
  return { tier: 'luna', reasons: ['localized, well-scoped work'], escalationTriggers: ['scope-expansion', 'context-gap'] };
}

function assignmentsForTier(tier) {
  const assignments = structuredClone(DEFAULTS);
  if (tier === 'luna') for (const key of ['planner', 'planReviewer', 'engineer', 'uiReviewer']) assignments[key] = { model: 'gpt-5.6-luna', reasoning: 'medium' };
  if (tier === 'terra') for (const key of ['planner', 'engineer', 'uiReviewer']) assignments[key] = { model: 'gpt-5.6-terra', reasoning: 'high' };
  return assignments;
}

function validateAssignments(assignments, expectedPrWriter) {
  if (!assignments || typeof assignments !== 'object') throw new Error('model assignments must be confirmed for every subagent');
  const keys = Object.keys(assignments).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...MODEL_ASSIGNMENT_ROLES].sort())) throw new Error('model assignments must include exactly the required subagent roles');
  for (const role of MODEL_ASSIGNMENT_ROLES) {
    const assignment = assignments[role];
    if (!ALLOWED_MODELS.has(assignment?.model) || !ALLOWED_REASONING.has(assignment?.reasoning)) throw new Error(`invalid model assignment for ${role}`);
  }
  if (JSON.stringify(assignments.prWriter) !== JSON.stringify(expectedPrWriter)) throw new Error('PR Description Writer must use gpt-5.6-luna with light reasoning');
}

export function proposeModelExecution(request, classification, defaults = DEFAULTS, preset) {
  const selectedPreset = preset ?? request.modelSelection?.preset ?? 'recommended';
  if (selectedPreset !== 'recommended' && selectedPreset !== 'individual' && !['light', 'medium', 'high'].includes(selectedPreset)) throw new Error(`unknown model preset: ${selectedPreset}`);
  const assignments = presetAssignments(selectedPreset) ?? structuredClone(defaults);
  if (selectedPreset === 'recommended') {
    if (classification.tier === 'luna') for (const key of ['planner', 'planReviewer', 'engineer', 'uiReviewer']) assignments[key] = { model: 'gpt-5.6-luna', reasoning: 'medium' };
    if (classification.tier === 'terra') for (const key of ['planner', 'engineer', 'uiReviewer']) assignments[key] = { model: 'gpt-5.6-terra', reasoning: 'high' };
  }
  return { proposalId: `model:${request.task ?? 'task'}`, tier: classification.tier, preset: selectedPreset, assignments, selectionOptions: SELECTION_OPTIONS, reasons: classification.reasons, status: 'awaiting-confirmation' };
}

export function approveModelExecution(proposal, approval) {
  if (proposal.status !== 'awaiting-confirmation') throw new Error('model proposal is not awaiting confirmation');
  if (proposal.proposalId !== approval.proposalId) throw new Error('model proposal ID does not match');
  const assignments = approval.acceptAll ? proposal.assignments : approval.assignments;
  validateAssignments(assignments, proposal.assignments.prWriter);
  return { ...proposal, assignments, status: 'approved', approval: { approvedBy: approval.approvedBy, approvedAt: approval.approvedAt } };
}

export function requestModelEscalation(current, target, reason) {
  if (!['luna', 'terra', 'sol'].includes(target)) throw new Error(`unknown escalation target: ${target}`);
  return { escalationId: `${current.proposalId}:${target}`, from: current.tier, to: target, reason, assignments: assignmentsForTier(target), status: 'awaiting-confirmation' };
}

export function approveModelEscalation(current, escalation, approval) {
  if (current.status !== 'approved') throw new Error('current model proposal is not approved');
  if (escalation.status !== 'awaiting-confirmation') throw new Error('model escalation is not awaiting confirmation');
  if (approval.escalationId !== escalation.escalationId) throw new Error('model escalation ID does not match');
  const assignments = approval.acceptAll ? escalation.assignments : approval.assignments;
  validateAssignments(assignments, escalation.assignments.prWriter);
  return {
    ...current,
    tier: escalation.to,
    assignments,
    escalation: { ...escalation, status: 'approved', approval: { approvedBy: approval.approvedBy, approvedAt: approval.approvedAt } },
    approval: { approvedBy: approval.approvedBy, approvedAt: approval.approvedAt },
    status: 'approved'
  };
}

export { ALLOWED_MODELS, ALLOWED_REASONING, DEFAULTS, MODEL_ASSIGNMENT_ROLES, SELECTION_OPTIONS };
