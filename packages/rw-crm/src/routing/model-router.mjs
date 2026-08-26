const DEFAULTS = {
  planner: { model: 'gpt-5.6-sol', reasoning: 'high' },
  planReviewer: { model: 'gpt-5.6-terra', reasoning: 'high' },
  engineer: { model: 'gpt-5.6-sol', reasoning: 'high' },
  uiReviewer: { model: 'gpt-5.6-terra', reasoning: 'high' },
  prWriter: { model: 'gpt-5.6-luna', reasoning: 'light' },
  orchestrator: { model: 'gpt-5.6-luna', reasoning: 'medium' }
};

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

export function proposeModelExecution(request, classification, defaults = DEFAULTS) {
  const assignments = structuredClone(defaults);
  if (classification.tier === 'luna') for (const key of ['planner', 'planReviewer', 'engineer', 'uiReviewer']) assignments[key] = { model: 'gpt-5.6-luna', reasoning: 'medium' };
  if (classification.tier === 'terra') for (const key of ['planner', 'engineer', 'uiReviewer']) assignments[key] = { model: 'gpt-5.6-terra', reasoning: 'high' };
  return { proposalId: `model:${request.task ?? 'task'}`, tier: classification.tier, assignments, reasons: classification.reasons, status: 'awaiting-confirmation' };
}

export function approveModelExecution(proposal, approval) {
  if (proposal.status !== 'awaiting-confirmation') throw new Error('model proposal is not awaiting confirmation');
  if (proposal.proposalId !== approval.proposalId) throw new Error('model proposal ID does not match');
  const assignments = approval.acceptAll ? proposal.assignments : approval.assignments;
  if (!assignments || typeof assignments !== 'object' || Object.keys(assignments).length !== Object.keys(proposal.assignments).length) throw new Error('model assignments must be confirmed for every subagent');
  if (JSON.stringify(assignments.prWriter) !== JSON.stringify(proposal.assignments.prWriter)) throw new Error('PR Description Writer must use gpt-5.6-luna with light reasoning');
  return { ...proposal, assignments, status: 'approved', approval: { approvedBy: approval.approvedBy, approvedAt: approval.approvedAt } };
}

export function requestModelEscalation(current, target, reason) {
  return { escalationId: `${current.proposalId}:${target}`, from: current.tier, to: target, reason, status: 'awaiting-confirmation' };
}

export { DEFAULTS };
