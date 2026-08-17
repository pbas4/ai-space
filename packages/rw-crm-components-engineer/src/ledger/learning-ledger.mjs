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
  next.proposals.push(proposal);
  next.persisted = false;
  return { ledger: next, proposal };
}

export function approveLearningEntry(ledger, proposalId, approvedAt) {
  const current = cloneLedger(ledger);
  const proposal = current.proposals.find((entry) => entry.id === proposalId);
  if (!proposal) throw new Error(`learning proposal not found: ${proposalId}`);
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
