import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const profiles = ['rw-crm-workflow', 'rw-crm-components-planner', 'rw-crm-plan-reviewer', 'rw-crm-components-engineer', 'rw-crm-ui-reviewer'];

test('manifest exports all independent RW CRM profiles and skills', async () => {
  const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.entrypoints.profiles).sort(), profiles.sort());
  assert.deepEqual(Object.keys(manifest.entrypoints.skills).sort(), profiles.sort());
  for (const profile of profiles) {
    const content = await readFile(join(root, `agents/${profile}.yaml`), 'utf8');
    assert.match(content, /independent: true/);
    assert.match(content, /composable: true/);
  }
});

test('workflow and model policy record UI routing and approval gates', async () => {
  const text = await Promise.all(['skills/rw-crm-workflow/SKILL.md', 'references/model-policy.md'].map((path) => readFile(join(root, path), 'utf8'))).then((files) => files.join('\n'));
  for (const phrase of ['Figma-linked', 'explicitly', 'UI-relevant', 'confirmation', 'escalation']) assert.match(text, new RegExp(phrase, 'i'));
});
