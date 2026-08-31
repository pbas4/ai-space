import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('bounded hardening prompt loop is ready and preserves its safety contract', async () => {
  const document = await readFile(new URL('../../../docs/superpowers/prompt-loops/2026-08-27-rw-crm-medium-low-hardening.md', import.meta.url), 'utf8');
  assert.match(document, /\*\*Status:\*\* ready/);
  for (const phrase of [
    'docs/superpowers/plans/2026-08-27-rw-crm-medium-low-hardening.md',
    'Work on at most one unchecked task',
    'written plan and code edits have explicit user approval',
    'unrelated changes', 'missing/disallowed context', 'material context change',
    'failed tests', 'missing approval', 'commit/push/merge/publish/install action',
    'Never run Nx'
  ]) assert.match(document, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), phrase);
});
