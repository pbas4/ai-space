function cloneLedger(ledger) {
  return {
    version: ledger.version ?? 1,
    entries: [...(ledger.entries ?? [])],
    proposals: [...(ledger.proposals ?? [])],
    ...(ledger.persisted === true ? { persisted: true } : {})
  };
}

export function readLedger(ledger) {
  return { version: ledger.version ?? 1, entries: [...(ledger.entries ?? [])] };
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeScope(scope) {
  return [...new Set((scope ?? []).map(normalizeText).filter(Boolean))].sort();
}

function lessonTokens(lesson) {
  return new Set(normalizeText(lesson).split(/[^\p{L}\p{N}.]+/u).filter((token) => token.length > 1));
}

function sameScope(left, right) {
  return JSON.stringify(normalizeScope(left)) === JSON.stringify(normalizeScope(right));
}

function intersects(left, right) {
  const values = new Set(normalizeScope(left));
  return normalizeScope(right).some((value) => values.has(value));
}

function overlappingTokens(left, right) {
  const values = lessonTokens(left);
  return [...lessonTokens(right)].some((token) => values.has(token));
}

export function findLearningDuplicates(ledger, proposal) {
  const candidates = ledger.entries ?? [];
  const exact = candidates.filter((entry) => entry.class === proposal.class && normalizeText(entry.lesson) === normalizeText(proposal.lesson) && sameScope(entry.scope, proposal.scope));
  const overlaps = candidates.filter((entry) => entry.class === proposal.class && !exact.includes(entry) && intersects(entry.scope, proposal.scope) && overlappingTokens(entry.lesson, proposal.lesson));
  return { exact, overlaps };
}

export function proposeLearningEntry(ledger, correction) {
  const next = cloneLedger(ledger);
  const proposal = {
    id: `proposal:${correction.id}`,
    class: correction.classification === 'stable-rule' ? 'stable-rule' : 'task-exception',
    lesson: correction.lesson,
    evidence: [...(correction.evidence ?? [])],
    scope: [...(correction.scope ?? [])],
    sourceCorrectionId: correction.id,
    persisted: false
  };
  const duplicates = findLearningDuplicates(next, proposal);
  proposal.duplicates = { exact: duplicates.exact.map((entry) => entry.id), overlaps: duplicates.overlaps.map((entry) => entry.id) };
  next.proposals.push(proposal);
  next.persisted = false;
  return { ledger: next, proposal, duplicates };
}

export function approveLearningEntry(ledger, proposalId, approvedAt, decision) {
  const current = cloneLedger(ledger);
  const proposal = current.proposals.find((entry) => entry.id === proposalId);
  if (!proposal) throw new Error(`learning proposal not found: ${proposalId}`);
  const duplicates = findLearningDuplicates(current, proposal);
  const hasDuplicates = duplicates.exact.length > 0 || duplicates.overlaps.length > 0;
  if (hasDuplicates && !['discard', 'create-distinct'].includes(decision) && !(typeof decision === 'string' && decision.startsWith('link:'))) {
    throw new Error('explicit duplicate decision is required before persistence');
  }
  if (decision === 'discard') return rejectLearningEntry(current, proposalId);
  if (typeof decision === 'string' && decision.startsWith('link:')) {
    const linkedId = decision.slice('link:'.length);
    if (![...duplicates.exact, ...duplicates.overlaps].some((entry) => entry.id === linkedId)) throw new Error(`duplicate lesson not found: ${linkedId}`);
    return rejectLearningEntry(current, proposalId);
  }
  const entry = {
    ...proposal,
    version: current.version + 1,
    persisted: true,
    approvedAt
  };
  return {
    ledger: {
      version: current.version + 1,
      entries: [...current.entries, entry],
      proposals: current.proposals.filter((item) => item.id !== proposalId),
      persisted: true
    },
    entry
  };
}

export function rejectLearningEntry(ledger, proposalId) {
  const current = cloneLedger(ledger);
  return {
    ledger: {
      version: current.version,
      entries: current.entries,
      proposals: current.proposals.filter((item) => item.id !== proposalId)
    }
  };
}
