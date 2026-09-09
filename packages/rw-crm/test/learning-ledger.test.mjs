import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readLedger,
  proposeLearningEntry,
  findLearningDuplicates,
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
  const approved = approveLearningEntry(proposed.ledger, proposed.proposal.id, '2026-08-17T12:00:00.000Z', 'create-distinct');
  assert.equal(approved.ledger.version, 2);
  assert.equal(approved.ledger.entries.length, 1);
  assert.equal(approved.ledger.entries[0].approvedAt, '2026-08-17T12:00:00.000Z');
  assert.equal(approved.ledger.persisted, true);
});

test('finds exact duplicates from normalized lesson text, class, and scope', () => {
  const existing = {
    version: 1,
    entries: [{ id: 'lesson:form-item', class: 'stable-rule', lesson: ' Use   Form.Item validation ', evidence: [], scope: ['forms'] }],
    proposals: []
  };
  const duplicates = findLearningDuplicates(existing, { lesson: 'Use Form.Item validation', class: 'stable-rule', scope: ['forms'] });
  assert.deepEqual(duplicates.exact.map((entry) => entry.id), ['lesson:form-item']);
  assert.deepEqual(duplicates.overlaps, []);
});

test('does not persist a duplicate lesson without an explicit caller decision', () => {
  const existing = {
    version: 1,
    entries: [{ id: 'lesson:form-item', class: 'stable-rule', lesson: 'Use Form.Item validation', evidence: [], scope: ['forms'] }],
    proposals: []
  };
  const proposed = proposeLearningEntry(existing, { id: 'corr-5', lesson: 'Use Form.Item validation', classification: 'stable-rule', evidence: [], scope: ['forms'] });
  assert.deepEqual(proposed.duplicates.exact.map((entry) => entry.id), ['lesson:form-item']);
  assert.throws(() => approveLearningEntry(proposed.ledger, proposed.proposal.id, '2026-08-17T12:00:00.000Z'), /explicit duplicate decision/);
  assert.equal(proposed.ledger.version, 1);
  assert.equal(proposed.ledger.entries.length, 1);
});

test('recognizes token-overlap lessons in an intersecting scope without merging them', () => {
  const existing = {
    version: 1,
    entries: [{ id: 'lesson:form-owner', class: 'stable-rule', lesson: 'Keep form state with the owner', evidence: [], scope: ['forms', 'state'] }],
    proposals: []
  };
  const proposed = proposeLearningEntry(existing, { id: 'corr-6', lesson: 'Keep form validation state local', classification: 'stable-rule', evidence: [], scope: ['forms'] });
  assert.deepEqual(proposed.duplicates.overlaps.map((entry) => entry.id), ['lesson:form-owner']);
  const linked = approveLearningEntry(proposed.ledger, proposed.proposal.id, '2026-08-17T12:00:00.000Z', 'link:lesson:form-owner');
  assert.equal(linked.ledger.version, 1);
  assert.equal(linked.ledger.entries.length, 1);
  assert.equal(linked.ledger.proposals.length, 0);
});

test('rejection does not mutate the ledger', () => {
  const proposed = proposeLearningEntry(ledger(), { id: 'corr-4', lesson: 'Do not generalize this exception', evidence: [], scope: ['DatePicker'] });
  const rejected = rejectLearningEntry(proposed.ledger, proposed.proposal.id);
  assert.deepEqual(rejected.ledger, ledger());
  assert.deepEqual(readLedger(rejected.ledger), { version: 1, entries: [] });
});
