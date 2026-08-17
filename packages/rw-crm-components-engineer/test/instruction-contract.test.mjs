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
