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

export { VALID_LEDGER_CLASSES, VALID_STATUSES };
