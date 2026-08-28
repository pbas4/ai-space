import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexHostAdapter } from '../src/adapters/host-adapter.mjs';

test('rejects a host without every required method', () => {
  assert.throws(() => createCodexHostAdapter({ discoverContext() {} }), /refreshContext must be a function/);
});

test('adapts required host methods through immutable workflow boundaries', async () => {
  const host = {
    discoverContext: async (request, policy) => ({ request, policy }),
    refreshContext: async (snapshot, policy) => ({ snapshot, policy }),
    proposeImplementation: async (context, request) => ({ context, request }),
    applyImplementation: async (plan, approvedEdits) => [plan, approvedEdits],
    verify: async (scope, changedArtifacts) => ({ scope, changedArtifacts })
  };

  const adapter = createCodexHostAdapter(host);
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(Object.isFrozen(adapter.implementationAdapter), true);
  assert.equal(Object.isFrozen(adapter.verifier), true);
  assert.deepEqual(await adapter.discover('request', 'policy'), { request: 'request', policy: 'policy' });
  assert.deepEqual(await adapter.refresh('snapshot', 'policy'), { snapshot: 'snapshot', policy: 'policy' });
  assert.deepEqual(await adapter.implementationAdapter.propose('context', 'request'), { context: 'context', request: 'request' });
  assert.deepEqual(await adapter.implementationAdapter.apply('plan', 'edits'), ['plan', 'edits']);
  assert.deepEqual(await adapter.verifier.run('scope', ['file']), { scope: 'scope', changedArtifacts: ['file'] });
});
