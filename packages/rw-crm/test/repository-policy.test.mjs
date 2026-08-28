import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRepositoryPolicy } from '../src/policy/repository-policy.mjs';

test('recognizes a normalized rw-crm-components remote', () => {
  const policy = resolveRepositoryPolicy({ repository: 'git@github.com:realworks/rw-crm-components.git' });

  assert.equal(policy.target, 'rw-crm-components');
  assert.equal(policy.versioningRequired, true);
  assert.equal(policy.changelogRequired, true);
  assert.equal(policy.prTemplate, 'rw-crm-components');
  assert.deepEqual(policy.verificationRules, ['package.json version', 'CHANGELOG.md']);
});

test('recognizes an exact rw-crm-components path segment', () => {
  const policy = resolveRepositoryPolicy({ repositoryScope: ['packages/rw-crm-components/src/Button.tsx'] });

  assert.equal(policy.target, 'rw-crm-components');
  assert.equal(policy.changelogRequired, true);
});

test('collects every matching path evidence item', () => {
  const policy = resolveRepositoryPolicy({
    repositoryScope: ['packages/rw-crm-components/src/Button.tsx'],
    changedArtifacts: ['packages/rw-crm-components/CHANGELOG.md']
  });

  assert.deepEqual(policy.evidence, [
    { kind: 'path-segment', source: 'repositoryScope', value: 'packages/rw-crm-components/src/Button.tsx' },
    { kind: 'path-segment', source: 'changedArtifacts', value: 'packages/rw-crm-components/CHANGELOG.md' }
  ]);
});

test('keeps partial repository names ambiguous without mutation obligations', () => {
  const policy = resolveRepositoryPolicy({ repositoryName: 'crm-components' });

  assert.equal(policy.target, 'ambiguous');
  assert.equal(policy.versioningRequired, false);
  assert.equal(policy.changelogRequired, false);
  assert.equal(policy.prTemplate, null);
  assert.deepEqual(policy.verificationRules, []);
  assert.equal(policy.evidence[0].kind, 'partial-name-match');
});

test('does not apply repository-specific obligations to other repositories', () => {
  const policy = resolveRepositoryPolicy({ repository: 'git@github.com:realworks/crm-web.git' });

  assert.equal(policy.target, 'other');
  assert.equal(policy.versioningRequired, false);
  assert.equal(policy.changelogRequired, false);
});
