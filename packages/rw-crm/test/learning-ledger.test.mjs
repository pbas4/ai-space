import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readLedger,
  proposeLearningEntry,
  approveLearningEntry,
  rejectLearningEntry
} from '../src/ledger/learning-ledger.mjs';

function ledger() {
  return { version: 1, entries: [], proposals: [] };
}

test('correction creates an unpersisted task exception proposal', () => {
  const result = proposeLearningEntry(ledger(), { id: 'corr-1', lesson: 'Use the shared field wrapper', evidence: ['review'], scope: ['Form'] });
  assert.equal(result.ledger.persisted, false);
  assert.equal(result.proposal.class, 'task-exception');
  assert.equal(result.ledger.entries.length, 0);
});

test('stable rules and task exceptions remain distinct', () => {
  const stable = proposeLearningEntry(ledger(), { id: 'corr-2', lesson: 'Always use shared theme tokens', classification: 'stable-rule', evidence: ['library'], scope: ['all'] });
  assert.equal(stable.proposal.class, 'stable-rule');
});

test('approval persists exactly one entry and bumps the version', () => {
  const proposed = proposeLearningEntry(ledger(), { id: 'corr-3', lesson: 'Keep state with the owner', classification: 'stable-rule', evidence: ['correction'], scope: ['state'] });
  const approved = approveLearningEntry(proposed.ledger, proposed.proposal.id, '2026-08-17T12:00:00Z');
  assert.equal(approved.ledger.version, 2);
  assert.equal(approved.ledger.entries.length, 1);
  assert.equal(approved.ledger.entries[0].approvedAt, '2026-08-17T12:00:00Z');
  assert.equal(approved.ledger.persisted, true);
});

test('rejection does not mutate the ledger', () => {
  const proposed = proposeLearningEntry(ledger(), { id: 'corr-4', lesson: 'Do not generalize this exception', evidence: [], scope: ['DatePicker'] });
  const rejected = rejectLearningEntry(proposed.ledger, proposed.proposal.id);
  assert.deepEqual(rejected.ledger, ledger());
  assert.deepEqual(readLedger(rejected.ledger), { version: 1, entries: [] });
});
