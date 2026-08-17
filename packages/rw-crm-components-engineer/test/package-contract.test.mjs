import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(join(root, relativePath), 'utf8');
}

test('package exposes RW CRM Components Engineer profile and reusable skill', async () => {
  const manifest = JSON.parse(await read('.codex-plugin/plugin.json'));
  const profile = await read('agents/rw-crm-components-engineer.yaml');
  const skill = await read('skills/rw-crm-components-engineer/SKILL.md');
  const packageJson = JSON.parse(await read('package.json'));

  assert.equal(manifest.name, 'rw-crm-components-engineer');
  assert.match(profile, /RW CRM Components Engineer/);
  assert.match(profile, /independently|independent/i);
  assert.match(profile, /compos/i);
  assert.match(profile, /approval/i);
  assert.match(profile, /structured/i);
  assert.match(skill, /plan/i);
  assert.match(skill, /code edits?/i);
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.scripts.test, 'npm run test:unit && npm run test:scenarios && npm run test:contract');
  assert.equal(packageJson.scripts.validate, 'npm run test && node scripts/validate-package.mjs');
});
