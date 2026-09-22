import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFile(join(root, path), 'utf8');

test('profile and references define the complete collaboration contract', async () => {
  const [profile, skill, workflow, conventions, consumer] = await Promise.all([
    read('agents/rw-crm-components-engineer.yaml'),
    read('skills/rw-crm-components-engineer/SKILL.md'),
    read('references/workflow.md'),
    read('references/rw-conventions.md'),
    read('references/create-task-plan-consumer-contract.md')
  ]);
  const text = [profile, skill, workflow, conventions, consumer].join('\n');
  for (const phrase of [
    'RW CRM Components Engineer', 'figma-linked', 'explicit invocation', 'read-only',
    'plan', 'code-edit', 'UI library', 'authoritative', '21790813', 'every',
    'stable', 'task-specific', 'missing', 'never guess', 'Create Task Plan',
    'verification', 'accessibility'
  ]) assert.match(text, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), phrase);
});

test('engineer requires component version and Pol changelog updates only in rw-crm-components', async () => {
  const skill = await read('skills/rw-crm-components-engineer/SKILL.md');
  const policy = await read('references/rw-components-versioning.md');
  const text = `${skill}\n${policy}`;
  for (const phrase of [
    'git@bitbucket.org:rwnl/rw-crm-components.git',
    'package.json', 'CHANGELOG.md', 'libs/', 'version', 'Pol',
    'component change', 'Do not apply', 'CHANGELOG-GUIDE.md'
  ]) assert.match(text, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), phrase);
});

test('RW CRM target-repository verification uses direct Jest and prohibits Nx', async () => {
  const paths = [
    'skills/rw-crm-workflow/SKILL.md',
    'skills/rw-crm-components-planner/SKILL.md',
    'skills/rw-crm-plan-reviewer/SKILL.md',
    'skills/rw-crm-components-engineer/SKILL.md',
    'skills/rw-crm-ui-reviewer/SKILL.md',
    'references/testing-policy.md'
  ];
  const text = await Promise.all(paths.map(read)).then((files) => files.join('\n'));
  assert.match(text, /direct Jest commands/i);
  assert.match(text, /never invoke Nx/i);
  assert.match(text, /Nx-wrapped/i);
});

test('RW CRM coverage targets executable production behavior', async () => {
  const policy = await read('references/testing-policy.md');
  for (const phrase of [
    'observable production behavior',
    'pure barrel',
    'index.ts(x)',
    'type-only',
    '.d.ts',
    'generated sources',
    'Storybook stories',
    'fixtures, mocks, and test utilities',
    'solely to execute excluded files',
    'regardless of filename',
    'runtime enums, constants, schemas, or custom configuration logic',
    'negative collectCoverageFrom patterns after positive patterns'
  ]) assert.match(policy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), phrase);
});

test('user-facing guidance names the planner and documents snapshot safety', async () => {
  const [plannerSkill, workflow, adapter, readme] = await Promise.all([
    read('skills/rw-crm-components-planner/SKILL.md'),
    read('references/workflow.md'),
    read('src/adapters/README.md'),
    read('README.md')
  ]);
  assert.doesNotMatch(plannerSkill, /RW UI Components Planner/);
  assert.match(workflow, /awaiting-context-reapproval/);
  assert.match(adapter, /createCodexHostAdapter/);
  for (const phrase of ['task-scoped', 'material refresh', 'allowlist', 'dry run', 'redacted']) assert.match(`${workflow}\n${adapter}\n${readme}`, new RegExp(phrase, 'i'));
});

test('planning guidance publishes readable Markdown artifacts without exposing hashes', async () => {
  const [planner, reviewer, workflow, consumer] = await Promise.all([
    read('skills/rw-crm-components-planner/SKILL.md'),
    read('skills/rw-crm-plan-reviewer/SKILL.md'),
    read('skills/rw-crm-workflow/SKILL.md'),
    read('references/create-task-plan-consumer-contract.md')
  ]);
  const text = `${planner}\n${reviewer}\n${workflow}\n${consumer}`;
  for (const phrase of [
    'conversation Markdown artifact',
    'ticketKey',
    'artifactRevision',
    'text/markdown',
    'previous revisions',
    'attachment is unavailable',
    'inline',
    'target repository'
  ]) assert.match(text, new RegExp(phrase, 'i'), phrase);
  assert.match(text, /never[^.]+SHA-256[^.]+(?:title|filename|content)/i);
  assert.match(text, /structured plan[^.]+source of truth/i);
});
