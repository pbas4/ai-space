import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Create Task Plan is a thin UI-only consumer with delegated brainstorming review', async () => {
  const contract = await readFile(join(root, 'references/create-task-plan-consumer-contract.md'), 'utf8');
  for (const phrase of ['thin consumer', 'UI', 'initial plan', 'brainstorming', 'does not invoke the package Plan Reviewer', 'does not modify the plugin', 'routing evidence', 'snapshot ID', 'context gaps', 'structured validation evidence']) assert.match(contract, new RegExp(phrase, 'i'));
});

test('Create Task Plan retains the initial artifact and publishes a readable final revision', async () => {
  const contract = await readFile(join(root, 'references/create-task-plan-consumer-contract.md'), 'utf8');
  for (const phrase of [
    'ticketKey',
    'artifactRevision',
    'retains the initial plan artifact',
    'new conversation Markdown artifact',
    'previous revisions',
    'attachment is unavailable',
    'inline'
  ]) assert.match(contract, new RegExp(phrase, 'i'), phrase);
});
