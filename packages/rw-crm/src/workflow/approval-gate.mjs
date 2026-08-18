export class ApprovalRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApprovalRequiredError';
  }
}

export function createApprovalState(planId, editSetHash) {
  return { status: 'awaiting-plan-approval', planId, editSetHash, planApproval: null, codeEditApproval: null };
}

export function approvePlan(state, approval) {
  if (state.status !== 'awaiting-plan-approval') throw new ApprovalRequiredError('approval status does not accept plan approval');
  if (approval.planId !== state.planId) throw new ApprovalRequiredError('plan ID does not match');
  return { ...state, status: 'awaiting-edit-approval', planApproval: { ...approval } };
}

export function approveCodeEdits(state, approval) {
  if (state.status !== 'awaiting-edit-approval') throw new ApprovalRequiredError('approval status does not accept code-edit approval');
  if (approval.planId !== state.planId) throw new ApprovalRequiredError('plan ID does not match');
  if (approval.editSetHash !== state.editSetHash) throw new ApprovalRequiredError('edit set does not match approved plan');
  return { ...state, status: 'authorized', codeEditApproval: { ...approval } };
}

export function assertImplementationAuthorized(state) {
  if (state.status !== 'authorized') throw new ApprovalRequiredError('both plan and code-edit approval are required');
  return true;
}
