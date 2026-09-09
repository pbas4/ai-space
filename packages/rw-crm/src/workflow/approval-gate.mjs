import { createHash } from 'node:crypto';

export class ApprovalRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApprovalRequiredError';
  }
}

function canonicalize(value, { omitApprovalFields = false } = {}) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, { omitApprovalFields }));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value)
      .filter((key) => !omitApprovalFields || !['approval', 'approvalReceipt'].includes(key))
      .sort()
      .map((key) => [key, canonicalize(value[key], { omitApprovalFields })]));
  }
  return value;
}

export function canonicalJson(value, options) {
  return JSON.stringify(canonicalize(value, options));
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value, { omitApprovalFields: true })).digest('hex');
}

function requireReceiptField(receipt, field) {
  if (typeof receipt?.[field] !== 'string' || receipt[field].trim() === '') throw new ApprovalRequiredError(`${field} is required`);
}

function requireTimestamp(value) {
  requireReceiptField({ approvedAt: value }, 'approvedAt');
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new ApprovalRequiredError('approvedAt must be an ISO-8601 timestamp');
}

function contextEvidence(snapshot) {
  if (typeof snapshot?.id !== 'string' || snapshot.id === '') throw new ApprovalRequiredError('context snapshot ID is required');
  if (typeof snapshot?.sourceDigest !== 'string' || snapshot.sourceDigest === '') throw new ApprovalRequiredError('context digest is required');
  return { contextSnapshotId: snapshot.id, contextDigest: snapshot.sourceDigest };
}

function requireContextReceiptEvidence(receipt) {
  requireReceiptField(receipt, 'contextSnapshotId');
  requireReceiptField(receipt, 'contextDigest');
  if (!/^[a-f0-9]{64}$/.test(receipt.contextSnapshotId)) throw new ApprovalRequiredError('context snapshot ID must be a SHA-256 digest');
  if (!/^[a-f0-9]{64}$/.test(receipt.contextDigest)) throw new ApprovalRequiredError('context digest must be a SHA-256 digest');
}

export function createPlanDigest(plan, contextSnapshot) {
  if (!plan || typeof plan !== 'object' || typeof plan.id !== 'string' || plan.id === '') throw new ApprovalRequiredError('plan ID is required');
  return digest({ plan, ...contextEvidence(contextSnapshot) });
}

export function createEditSetDigest(planId, edits) {
  if (typeof planId !== 'string' || planId === '') throw new ApprovalRequiredError('plan ID is required');
  if (!Array.isArray(edits)) throw new ApprovalRequiredError('edits must be an array');
  return digest({ planId, edits });
}

export function createApprovalState(plan, contextSnapshot) {
  const evidence = contextEvidence(contextSnapshot);
  return { status: 'awaiting-plan-approval', planId: plan.id, planHash: createPlanDigest(plan, contextSnapshot), ...evidence, editSetHash: null, planApproval: null, codeEditApproval: null };
}

export function approvePlan(state, receipt) {
  if (state.status !== 'awaiting-plan-approval') throw new ApprovalRequiredError('approval status does not accept plan approval');
  requireContextReceiptEvidence(receipt);
  if (receipt.planId !== state.planId) throw new ApprovalRequiredError('plan ID does not match');
  if (receipt.planHash !== state.planHash) throw new ApprovalRequiredError('plan hash does not match approved plan');
  if (receipt.contextSnapshotId !== state.contextSnapshotId) throw new ApprovalRequiredError('context snapshot ID does not match');
  if (receipt.contextDigest !== state.contextDigest) throw new ApprovalRequiredError('context digest does not match');
  requireReceiptField(receipt, 'approvedBy');
  requireTimestamp(receipt.approvedAt);
  return { ...state, status: 'awaiting-edit-approval', planApproval: { ...receipt } };
}

export function proposeCodeEdits(state, edits) {
  if (state.status !== 'awaiting-edit-approval' || !state.planApproval) throw new ApprovalRequiredError('plan approval is required before proposing code edits');
  return { ...state, editSetHash: createEditSetDigest(state.planId, edits) };
}

export function approveCodeEdits(state, receipt) {
  if (state.status !== 'awaiting-edit-approval') throw new ApprovalRequiredError('approval status does not accept code-edit approval');
  if (!state.editSetHash) throw new ApprovalRequiredError('code edits have not been proposed');
  requireContextReceiptEvidence(receipt);
  requireReceiptField(receipt, 'editSetHash');
  if (receipt.planId !== state.planId) throw new ApprovalRequiredError('plan ID does not match');
  if (receipt.planHash !== state.planHash) throw new ApprovalRequiredError('plan hash does not match approved plan');
  if (receipt.contextSnapshotId !== state.contextSnapshotId) throw new ApprovalRequiredError('context snapshot ID does not match');
  if (receipt.contextDigest !== state.contextDigest) throw new ApprovalRequiredError('context digest does not match');
  if (receipt.editSetHash !== state.editSetHash) throw new ApprovalRequiredError('edit set does not match approved plan');
  requireReceiptField(receipt, 'approvedBy');
  requireTimestamp(receipt.approvedAt);
  return { ...state, status: 'authorized', codeEditApproval: { ...receipt } };
}

export function assertImplementationAuthorized(state) {
  if (state.status !== 'authorized') throw new ApprovalRequiredError('both plan and code-edit approval are required');
  return true;
}
