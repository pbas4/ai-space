import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('RW CRM package replaces the former single-engineer package root', async () => {
  await access(join(workspace, 'packages/rw-crm'));
  await assert.rejects(access(join(workspace, 'packages/rw-crm-components-engineer')));
  const manifest = JSON.parse(await readFile(join(workspace, 'packages/rw-crm/.codex-plugin/plugin.json'), 'utf8'));
  const profile = await readFile(join(workspace, 'packages/rw-crm/agents/rw-crm-components-engineer.yaml'), 'utf8');
  assert.equal(manifest.name, 'rw-crm');
  assert.match(profile, /name: rw-crm-components-engineer/);
});
