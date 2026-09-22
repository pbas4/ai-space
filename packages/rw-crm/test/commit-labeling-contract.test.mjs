import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = join(packageRoot, '..', '..');
const readPackage = (relativePath) => readFile(join(packageRoot, relativePath), 'utf8');
const readWorkspace = (relativePath) => readFile(join(workspaceRoot, relativePath), 'utf8');

test('shared policy records its source and defines the three attribution tiers', async () => {
  const policy = await readPackage('references/ai-code-labeling.md');

  for (const phrase of [
    '2262270017',
    'version 6',
    'September 15, 2026',
    'Full AI',
    'AI assisted',
    'Human',
    'AI as author',
    'Co-authored-by:',
    'No AI trailer'
  ]) {
    assert.match(policy, new RegExp(phrase, 'i'), phrase);
  }
});

test('commit flow requires authorization, tier confirmation, and a fresh AI identity', async () => {
  const policy = await readPackage('references/ai-code-labeling.md');

  for (const phrase of [
    'explicit commit request',
    'propose',
    'short reason',
    'confirm',
    'every commit',
    'Name <email>',
    'urgency',
    'do not commit'
  ]) {
    assert.match(policy, new RegExp(phrase, 'i'), phrase);
  }
});

test('policy covers mixed ownership and prevents persistent Git mutations', async () => {
  const policy = await readPackage('references/ai-code-labeling.md');

  for (const phrase of [
    'squash',
    'ambiguous',
    'AI assisted',
    'Git configuration',
    'hooks',
    'unrelated (?:commit )?trailers',
    'verify'
  ]) {
    assert.match(policy, new RegExp(phrase, 'i'), phrase);
  }
});

test('only commit-capable RW skills route to the shared policy', async () => {
  const [workflow, engineer, planner, planReviewer, uiReviewer, prWriter] = await Promise.all([
    readPackage('skills/rw-crm-workflow/SKILL.md'),
    readPackage('skills/rw-crm-components-engineer/SKILL.md'),
    readPackage('skills/rw-crm-components-planner/SKILL.md'),
    readPackage('skills/rw-crm-plan-reviewer/SKILL.md'),
    readPackage('skills/rw-crm-ui-reviewer/SKILL.md'),
    readPackage('skills/rw-crm-pr-description-writer/SKILL.md')
  ]);

  const policyLink = /references\/ai-code-labeling\.md/;
  assert.match(workflow, policyLink);
  assert.match(engineer, policyLink);
  for (const readOnlySkill of [planner, planReviewer, uiReviewer, prWriter]) {
    assert.doesNotMatch(readOnlySkill, policyLink);
  }
});

test('package validation requires both the policy and its contract test', async () => {
  const validator = await readPackage('scripts/validate-package.mjs');

  assert.match(validator, /references\/ai-code-labeling\.md/);
  assert.match(validator, /test\/commit-labeling-contract\.test\.mjs/);
});

test('package and both marketplace entries publish version 0.2.2', async () => {
  const [packageJson, codexManifest, claudeManifest, codexCatalog, claudeCatalog] = await Promise.all([
    readPackage('package.json').then(JSON.parse),
    readPackage('.codex-plugin/plugin.json').then(JSON.parse),
    readPackage('.claude-plugin/plugin.json').then(JSON.parse),
    readWorkspace('.agents/plugins/marketplace.json').then(JSON.parse),
    readWorkspace('.claude-plugin/marketplace.json').then(JSON.parse)
  ]);

  const findRwCrm = (catalog) => catalog.plugins.find(({ name }) => name === 'rw-crm');
  for (const version of [
    packageJson.version,
    codexManifest.version,
    claudeManifest.version,
    findRwCrm(codexCatalog).version,
    findRwCrm(claudeCatalog).version
  ]) {
    assert.equal(version, '0.2.2');
  }
});
