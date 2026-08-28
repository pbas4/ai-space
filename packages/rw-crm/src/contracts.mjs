import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSupportedSchema, validateSchema } from './contracts/schema-runtime.mjs';

const schemaDirectory = join(dirname(fileURLToPath(import.meta.url)), '../schemas');
const schemaNames = [
  'approval-receipt', 'context-envelope', 'engineer-result', 'initial-plan',
  'learning-ledger', 'model-proposal', 'plan-review', 'ui-review', 'context-snapshot'
];
const schemas = Object.fromEntries(await Promise.all(schemaNames.map(async (name) => {
  const schema = JSON.parse(await readFile(join(schemaDirectory, `${name}.schema.json`), 'utf8'));
  assertSupportedSchema(schema);
  return [name, schema];
})));

const VALID_STATUSES = new Set(['needs-context', 'awaiting-plan-approval', 'awaiting-edit-approval', 'awaiting-context-reapproval', 'implemented', 'blocked']);
const VALID_LEDGER_CLASSES = new Set(['stable-rule', 'task-exception']);

const result = (errors) => ({ valid: errors.length === 0, errors });

export function validateWithSchema(schemaName, value) {
  const schema = schemas[schemaName];
  if (!schema) throw new Error(`Unknown package schema: ${schemaName}`);
  return validateSchema(schema, value);
}

export function createContextEnvelope(input) {
  return {
    task: input.task,
    componentScope: [...(input.componentScope ?? [])],
    repositoryScope: [...(input.repositoryScope ?? [])],
    figmaLinks: [...(input.figmaLinks ?? [])],
    constraints: [...(input.constraints ?? [])],
    approvals: { plan: input.approvals?.plan ?? null, codeEdits: input.approvals?.codeEdits ?? null }
  };
}

export const validateContextEnvelope = (value) => validateWithSchema('context-envelope', value);
export const validateContextSnapshot = (value) => validateWithSchema('context-snapshot', value);
export function validateEngineerResult(value) {
  const errors = [...validateWithSchema('engineer-result', value).errors];
  if (value?.status === 'awaiting-context-reapproval') {
    if (!value.contextSnapshot) errors.push('$.contextSnapshot is required when status is awaiting-context-reapproval');
    else errors.push(...validateContextSnapshot(value.contextSnapshot).errors.map((error) => `$.contextSnapshot${error.slice(1)}`));
    for (const field of ['previousSnapshotId', 'currentSnapshotId', 'changes']) {
      if (!(field in value)) errors.push(`$.${field} is required when status is awaiting-context-reapproval`);
    }
  }
  return result(errors);
}

export function validateLedgerEntry(value) {
  const errors = [...validateWithSchema('learning-ledger', value).errors];
  if (value?.persisted && typeof value.approvedAt !== 'string') errors.push('$.approvedAt is required for persisted entries');
  return result(errors);
}

export const validateInitialPlan = (value) => validateWithSchema('initial-plan', value);
export const validatePlanReview = (value) => validateWithSchema('plan-review', value);
export const validateUiReview = (value) => validateWithSchema('ui-review', value);

export function validateModelProposal(value) {
  const errors = [...validateWithSchema('model-proposal', value).errors];
  if (value?.status === 'approved' && !value.approval) errors.push('$.approval is required when status is approved');
  return result(errors);
}

export function validateApprovalReceipt(value, { requireEditSetHash = false } = {}) {
  const errors = [...validateWithSchema('approval-receipt', value).errors];
  if (requireEditSetHash && !/^[a-f0-9]{64}$/.test(value?.editSetHash ?? '')) errors.push('$.editSetHash must be a SHA-256 digest');
  return result(errors);
}

export { VALID_LEDGER_CLASSES, VALID_STATUSES };
