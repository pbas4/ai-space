import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourcePolicy } from '../src/context/source-policy.mjs';

test('rejects an unapproved Figma host', () => {
  assert.equal(createSourcePolicy({ figmaHosts: ['figma.com'] })
    .authorizeSource({ kind: 'figma', uri: 'https://evil.example/file/1' }).allowed, false);
});

test('normalizes an approved Figma https host', () => {
  const authorization = createSourcePolicy({ figmaHosts: ['figma.com'] })
    .authorizeSource({ kind: 'figma', uri: 'https://www.figma.com/file/1' });

  assert.equal(authorization.allowed, true);
  assert.equal(authorization.normalized.host, 'figma.com');
  assert.equal(authorization.normalized.uri, 'https://figma.com/file/1');
  assert.equal(authorization.reason, null);
});

test('authorizes normalized Confluence identifiers and repository remotes', () => {
  const policy = createSourcePolicy({
    confluenceHosts: ['confluence.example'],
    repositoryRemotes: ['github.com/realworks/rw-crm-components']
  });

  assert.deepEqual(policy.authorizeSource({ kind: 'confluence', uri: 'https://www.confluence.example/pages/21790813' }), {
    allowed: true,
    normalized: { host: 'confluence.example', id: '21790813', uri: 'confluence://21790813' },
    reason: null
  });
  assert.deepEqual(policy.authorizeSource({ kind: 'repository', uri: 'git@GitHub.com:Realworks/rw-crm-components.git' }), {
    allowed: true,
    normalized: { remote: 'github.com/realworks/rw-crm-components' },
    reason: null
  });
});

test('normalizes bare and confluence URI page identifiers', () => {
  const policy = createSourcePolicy();

  for (const uri of ['21790813', 'confluence://21790813']) {
    assert.deepEqual(policy.authorizeSource({ kind: 'confluence', uri }), {
      allowed: true,
      normalized: { id: '21790813', uri: 'confluence://21790813' },
      reason: null
    });
  }
});

test('reports invalid and unknown source input explicitly', () => {
  const policy = createSourcePolicy();

  assert.deepEqual(policy.authorizeSource({ kind: 'figma', uri: 'not a uri' }), {
    allowed: false,
    normalized: null,
    reason: 'invalid-uri'
  });
  assert.deepEqual(policy.authorizeSource({ kind: 'unsupported', uri: 'https://example.com' }), {
    allowed: false,
    normalized: null,
    reason: 'unknown-source-kind'
  });
});
