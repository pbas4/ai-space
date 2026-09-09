import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContextEnvelope,
  validateContextEnvelope,
  validateEngineerResult,
  validateLedgerEntry
} from '../src/contracts.mjs';
import { createContextSnapshot } from '../src/context/context-snapshot.mjs';

const baseRequest = {
  task: 'Add a date picker component',
  componentScope: ['DatePicker'],
  repositoryScope: ['packages/ui'],
  figmaLinks: ['https://figma.com/file/example'],
  constraints: [],
  approvals: { plan: null, codeEdits: null }
};

test('creates and validates a complete context envelope', () => {
  const envelope = createContextEnvelope(baseRequest);
  assert.equal(validateContextEnvelope(envelope).valid, true);
  assert.deepEqual(envelope.componentScope, ['DatePicker']);
});

test('rejects a context envelope without a task', () => {
  const result = validateContextEnvelope({ ...baseRequest, task: '' });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /task/);
});

test('rejects unknown learning classes and unapproved persisted entries', () => {
  const result = validateLedgerEntry({
    id: 'lesson-1', version: 1, class: 'unknown', lesson: 'x', evidence: [], scope: []
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /class/);

  const unapproved = validateLedgerEntry({
    id: 'lesson-1', version: 1, class: 'stable-rule', lesson: 'x', evidence: [], scope: [], persisted: true
  });
  assert.equal(unapproved.valid, false);
  assert.match(unapproved.errors.join('\n'), /approvedAt/);
});

test('validates a structured engineer result', () => {
  const result = validateEngineerResult({
    context: { scope: {}, sources: [], evidence: [], gaps: [], ambiguities: [], libraryDecisions: [] },
    plan: null,
    status: 'needs-context',
    changedArtifacts: [],
    verification: { checks: [] },
    proposedLearningEntry: null
  });
  assert.equal(result.valid, true);
});

test('validates a context reapproval result with its snapshot delta', () => {
  const contextSnapshot = createContextSnapshot({
    taskId: 'task-1',
    now: '2026-08-28T10:00:00.000Z',
    context: { selectedSources: [], gaps: [], ambiguities: [] }
  });
  const result = validateEngineerResult({
    context: contextSnapshot,
    contextSnapshot,
    plan: { id: 'plan-1' },
    status: 'awaiting-context-reapproval',
    previousSnapshotId: 'a'.repeat(64),
    currentSnapshotId: contextSnapshot.id,
    changes: [{ type: 'gap-changed' }],
    changedArtifacts: [],
    verification: { checks: [] },
    proposedLearningEntry: null
  });
  assert.equal(result.valid, true);
});
