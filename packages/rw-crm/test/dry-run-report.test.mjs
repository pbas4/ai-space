import test from 'node:test';
import assert from 'node:assert/strict';
import { createDryRunReport } from '../src/reporting/dry-run-report.mjs';

const digest = 'a'.repeat(64);
const contextSnapshot = {
  id: digest,
  sourceDigest: 'b'.repeat(64),
  selectedSources: [{
    id: 'confluence:forms',
    uri: 'https://example.test/forms?token=ignore-me',
    bodyDigest: 'c'.repeat(64),
    body: 'source body must never be reported'
  }],
  gaps: [{ summary: 'No component example is available', secret: 'ignore-me' }]
};

test('creates a schema-valid, redacted dry-run audit report', () => {
  const report = createDryRunReport({
    routing: { task: 'component', token: 'ignore-me' },
    modelProposal: { proposalId: 'model:1', assignments: { engineer: { model: 'gpt-5.6-sol' } } },
    approvalState: {
      status: 'authorized',
      planId: 'plan:1',
      planHash: digest,
      contextSnapshotId: contextSnapshot.id,
      contextDigest: contextSnapshot.sourceDigest,
      planApproval: { planId: 'plan:1', planHash: digest, contextSnapshotId: contextSnapshot.id, contextDigest: contextSnapshot.sourceDigest },
      codeEditApproval: { editSetHash: 'd'.repeat(64), authorization: 'ignore-me' }
    },
    contextSnapshot,
    commands: ['node --test test/a.test.mjs'],
    verification: [{ name: 'unit tests', status: 'passed', cookie: 'ignore-me' }],
    findings: [],
    prDescription: { title: 'Add forms', body: 'secret=redact-me' }
  });

  assert.equal(report.context.snapshotId, contextSnapshot.id);
  assert.deepEqual(report.context.sources, [{ id: 'confluence:forms', uri: 'https://example.test/forms', contentDigest: 'c'.repeat(64) }]);
  assert.deepEqual(report.commands, [{ name: 'node --test test/a.test.mjs', status: 'not-run' }]);
  assert.equal(report.prDraft.body, 'secret=[REDACTED]');
  assert.doesNotMatch(JSON.stringify(report), /redact-me|ignore-me|source body/i);
});

test('rejects report input whose projected output violates the dry-run schema', () => {
  assert.throws(() => createDryRunReport({ contextSnapshot: { id: 'not-a-digest' } }), /invalid dry-run report/);
});
