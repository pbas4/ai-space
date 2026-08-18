const VALID_STATUSES = new Set([
  'needs-context',
  'awaiting-plan-approval',
  'awaiting-edit-approval',
  'implemented',
  'blocked'
]);
const VALID_LEDGER_CLASSES = new Set(['stable-rule', 'task-exception']);

const result = (errors) => ({ valid: errors.length === 0, errors });

export function createContextEnvelope(input) {
  return {
    task: input.task,
    componentScope: [...(input.componentScope ?? [])],
    repositoryScope: [...(input.repositoryScope ?? [])],
    figmaLinks: [...(input.figmaLinks ?? [])],
    constraints: [...(input.constraints ?? [])],
    approvals: {
      plan: input.approvals?.plan ?? null,
      codeEdits: input.approvals?.codeEdits ?? null
    }
  };
}

export function validateContextEnvelope(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['context envelope must be an object']);
  if (typeof value.task !== 'string' || value.task.trim() === '') errors.push('task is required');
  for (const field of ['componentScope', 'repositoryScope', 'figmaLinks', 'constraints']) {
    if (!Array.isArray(value[field])) errors.push(`${field} must be an array`);
  }
  if (!value.approvals || typeof value.approvals !== 'object') errors.push('approvals is required');
  return result(errors);
}

export function validateEngineerResult(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['engineer result must be an object']);
  for (const field of ['context', 'verification']) if (!value[field]) errors.push(`${field} is required`);
  if (!VALID_STATUSES.has(value.status)) errors.push('status is invalid');
  if (!Array.isArray(value.changedArtifacts)) errors.push('changedArtifacts must be an array');
  if (!('plan' in value)) errors.push('plan is required');
  if (!('proposedLearningEntry' in value)) errors.push('proposedLearningEntry is required');
  return result(errors);
}

export function validateLedgerEntry(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['ledger entry must be an object']);
  for (const field of ['id', 'lesson']) if (typeof value[field] !== 'string' || value[field] === '') errors.push(`${field} is required`);
  if (!Number.isInteger(value.version) || value.version < 1) errors.push('version must be a positive integer');
  if (!VALID_LEDGER_CLASSES.has(value.class)) errors.push('class is invalid');
  if (!Array.isArray(value.evidence)) errors.push('evidence must be an array');
  if (!Array.isArray(value.scope)) errors.push('scope must be an array');
  if (value.persisted && typeof value.approvedAt !== 'string') errors.push('approvedAt is required for persisted entries');
  return result(errors);
}

export function validateInitialPlan(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['initial plan must be an object']);
  for (const field of ['id', 'goal']) if (typeof value[field] !== 'string' || value[field] === '') errors.push(`${field} is required`);
  for (const field of ['files', 'interfaces', 'risks', 'verification', 'libraryDecisions']) if (!Array.isArray(value[field])) errors.push(`${field} must be an array`);
  if (!value.scope || typeof value.scope !== 'object') errors.push('scope is required');
  if (value.approvalStatus !== 'awaiting-approval') errors.push('initial plans must await approval');
  return result(errors);
}

export function validatePlanReview(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['plan review must be an object']);
  if (!Array.isArray(value.findings)) errors.push('findings must be an array');
  if (!value.reviewedPlan || typeof value.reviewedPlan !== 'object') errors.push('reviewedPlan is required');
  if (!new Set(['approve', 'revise', 'blocked']).has(value.recommendation)) errors.push('recommendation is invalid');
  return result(errors);
}

export function validateUiReview(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['UI review must be an object']);
  if (!Array.isArray(value.findings)) errors.push('findings must be an array');
  if (!value.verification || typeof value.verification !== 'object') errors.push('verification is required');
  if (!new Set(['pass', 'blocked', 'pass-with-findings']).has(value.completion)) errors.push('completion is invalid');
  return result(errors);
}

export function validateModelProposal(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return result(['model proposal must be an object']);
  if (typeof value.proposalId !== 'string' || value.proposalId === '') errors.push('proposalId is required');
  if (!new Set(['luna', 'terra', 'sol']).has(value.tier)) errors.push('tier is invalid');
  if (!value.assignments || typeof value.assignments !== 'object') errors.push('assignments is required');
  if (!Array.isArray(value.reasons)) errors.push('reasons must be an array');
  if (!new Set(['awaiting-confirmation', 'approved', 'rejected']).has(value.status)) errors.push('status is invalid');
  return result(errors);
}

export { VALID_LEDGER_CLASSES, VALID_STATUSES };
