import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Create Task Plan is a thin UI-only consumer with delegated brainstorming review', async () => {
  const contract = await readFile(join(root, 'references/create-task-plan-consumer-contract.md'), 'utf8');
  for (const phrase of ['thin consumer', 'UI', 'initial plan', 'brainstorming', 'does not invoke the package Plan Reviewer', 'does not modify the plugin']) assert.match(contract, new RegExp(phrase, 'i'));
});
