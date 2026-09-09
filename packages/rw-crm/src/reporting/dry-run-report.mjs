import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchema } from '../contracts/schema-runtime.mjs';

const schemaDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../schemas');
const readSchema = (name) => JSON.parse(readFileSync(join(schemaDirectory, `${name}.schema.json`), 'utf8'));
const dryRunSchema = readSchema('dry-run-report');
const verificationSchema = readSchema('verification-evidence');
const findingSchema = readSchema('finding');
const SENSITIVE_KEY = /token|secret|authorization|cookie|password/i;
const SENSITIVE_ASSIGNMENT = /(token|secret|authorization|cookie|password)\s*[:=]\s*[^\s,;&]+/gi;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(child)]));
  }
  return typeof value === 'string' ? value.replace(SENSITIVE_ASSIGNMENT, '$1=[REDACTED]') : value;
}

function normalizeUri(uri) {
  try {
    const parsed = new URL(uri);
    for (const key of [...parsed.searchParams.keys()]) if (SENSITIVE_KEY.test(key)) parsed.searchParams.delete(key);
    return parsed.toString().replace(/[?]$/, '');
  } catch {
    return redact(uri);
  }
}

function projectRouting(routing = {}) {
  return redact({ classification: routing.classification ?? null, confidence: routing.confidence ?? null, invoke: routing.invoke ?? null, reason: routing.reason ?? null });
}

function projectModels(modelProposal = {}) {
  return redact({ proposalId: modelProposal.proposalId ?? null, tier: modelProposal.tier ?? null, preset: modelProposal.preset ?? null, status: modelProposal.status ?? null, assignments: Object.fromEntries(Object.entries(modelProposal.assignments ?? {}).map(([role, assignment]) => [role, { model: assignment?.model ?? null, reasoning: assignment?.reasoning ?? null }])) });
}

function projectApprovals(approvalState = {}) {
  const receipt = (value) => redact({ planId: value?.planId ?? null, planHash: value?.planHash ?? null, contextSnapshotId: value?.contextSnapshotId ?? null, contextDigest: value?.contextDigest ?? null, editSetHash: value?.editSetHash ?? null });
  return { status: approvalState.status ?? null, planId: approvalState.planId ?? null, planHash: approvalState.planHash ?? null, contextSnapshotId: approvalState.contextSnapshotId ?? null, contextDigest: approvalState.contextDigest ?? null, editSetHash: approvalState.editSetHash ?? null, planReceipt: receipt(approvalState.planApproval), codeEditReceipt: receipt(approvalState.codeEditApproval) };
}

function projectContext(contextSnapshot = {}) {
  return {
    snapshotId: contextSnapshot.id,
    sourceDigest: contextSnapshot.sourceDigest,
    sources: (contextSnapshot.selectedSources ?? []).map((source) => ({ id: source.id, uri: normalizeUri(source.uri), contentDigest: source.bodyDigest ?? null })),
    gaps: (contextSnapshot.gaps ?? []).map((gap) => typeof gap === 'string' ? redact(gap) : redact(gap?.summary ?? 'gap recorded'))
  };
}

function projectCommands(commands = []) {
  return commands.map((command) => typeof command === 'string' ? { name: redact(command), status: 'not-run' } : { name: redact(command.name), status: command.status ?? 'not-run' });
}

function validate(schema, value, label) {
  const result = validateSchema(schema, value);
  if (!result.valid) throw new TypeError(`invalid ${label}: ${result.errors.join('; ')}`);
}

export function createDryRunReport({ routing, modelProposal, approvalState, contextSnapshot, commands = [], verification = [], findings = [], prDescription = {} } = {}) {
  const report = redact({
    routing: projectRouting(routing),
    models: projectModels(modelProposal),
    approvals: projectApprovals(approvalState),
    context: projectContext(contextSnapshot),
    commands: projectCommands(commands),
    verification: verification.map((entry) => ({ name: entry.name, status: entry.status, ...(entry.receiptId ? { receiptId: entry.receiptId } : {}), ...(entry.receiptHash ? { receiptHash: entry.receiptHash } : {}) })),
    findings: findings.map((finding) => ({ id: finding.id, severity: finding.severity, summary: finding.summary, ...(finding.evidenceHash ? { evidenceHash: finding.evidenceHash } : {}) })),
    prDraft: { title: prDescription.title ?? null, body: prDescription.body ?? null }
  });
  for (const entry of report.verification) validate(verificationSchema, entry, 'verification evidence');
  for (const finding of report.findings) validate(findingSchema, finding, 'finding');
  validate(dryRunSchema, report, 'dry-run report');
  return report;
}
