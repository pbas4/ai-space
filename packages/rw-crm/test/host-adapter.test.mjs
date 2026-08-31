import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexHostAdapter } from '../src/adapters/host-adapter.mjs';

test('rejects a host without every required method', () => {
  assert.throws(() => createCodexHostAdapter({ discoverCandidates() {} }), /retrieveSource must be a function/);
});

test('rejects candidates before retrieval and reports explicit gaps', async () => {
  const retrieved = [];
  const host = {
    discoverCandidates: async () => [
      { id: 'rejected', kind: 'figma', uri: 'https://evil.example/file/1' },
      { id: 'allowed', kind: 'figma', uri: 'https://www.figma.com/file/1' }
    ],
    retrieveSource: async (candidate) => {
      retrieved.push(candidate.id);
      return candidate;
    },
    refreshContext: async (snapshot, policy) => ({ snapshot, policy }),
    proposeImplementation: async (context, request) => ({ context, request }),
    applyImplementation: async (plan, approvedEdits) => [plan, approvedEdits],
    verify: async (scope, changedArtifacts) => ({ scope, changedArtifacts })
  };

  const adapter = createCodexHostAdapter(host, {
    authorizeSource: (candidate) => candidate.id === 'allowed'
      ? { allowed: true, normalized: { host: 'figma.com' }, reason: null }
      : { allowed: false, normalized: { host: 'evil.example' }, reason: 'unapproved-host' }
  });

  assert.deepEqual(await adapter.discover('request'), {
    selectedSources: [{ id: 'allowed', kind: 'figma', uri: 'https://www.figma.com/file/1', normalized: { host: 'figma.com' } }],
    gaps: [{ sourceId: 'rejected', reason: 'unapproved-host', impact: 'source was rejected before retrieval' }]
  });
  assert.deepEqual(retrieved, ['allowed']);
});

test('adapts required host methods through immutable workflow boundaries', async () => {
  const host = {
    discoverCandidates: async () => [],
    retrieveSource: async () => null,
    refreshContext: async (snapshot, policy) => ({ snapshot, policy }),
    proposeImplementation: async (context, request) => ({ context, request }),
    applyImplementation: async (plan, approvedEdits) => [plan, approvedEdits],
    verify: async (scope, changedArtifacts) => ({ scope, changedArtifacts })
  };

  const adapter = createCodexHostAdapter(host, { authorizeSource: () => ({ allowed: true, normalized: null, reason: null }) });
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(Object.isFrozen(adapter.implementationAdapter), true);
  assert.equal(Object.isFrozen(adapter.verifier), true);
  assert.deepEqual(await adapter.discover('request'), { selectedSources: [], gaps: [] });
  assert.deepEqual(await adapter.refresh('snapshot', 'policy'), { snapshot: 'snapshot', policy: 'policy' });
  assert.deepEqual(await adapter.implementationAdapter.propose('context', 'request'), { context: 'context', request: 'request' });
  assert.deepEqual(await adapter.implementationAdapter.apply('plan', 'edits'), ['plan', 'edits']);
  assert.deepEqual(await adapter.verifier.run('scope', ['file']), { scope: 'scope', changedArtifacts: ['file'] });
});
