import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const profiles = ['rw-crm-workflow', 'rw-crm-components-planner', 'rw-crm-plan-reviewer', 'rw-crm-components-engineer', 'rw-crm-ui-reviewer', 'rw-crm-pr-description-writer'];

test('manifest exports all independent RW CRM profiles and skills', async () => {
  const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.skills, './skills/');
  for (const profile of profiles) {
    const content = await readFile(join(root, `agents/${profile}.yaml`), 'utf8');
    assert.match(content, /independent: true/);
    assert.match(content, /composable: true/);
  }
  const prWriter = await readFile(join(root, 'agents/rw-crm-pr-description-writer.yaml'), 'utf8');
  assert.match(prWriter, /gpt-5\.6-luna/);
  assert.match(prWriter, /reasoning_effort: light/);
  for (const skill of profiles) {
    const content = await readFile(join(root, `skills/${skill}/SKILL.md`), 'utf8');
    assert.match(content, /^---\nname: .+\ndescription: .+\n---\n/);
  }
});

test('workflow and model policy record UI routing and approval gates', async () => {
  const text = await Promise.all(['skills/rw-crm-workflow/SKILL.md', 'references/model-policy.md'].map((path) => readFile(join(root, path), 'utf8'))).then((files) => files.join('\n'));
  for (const phrase of ['Figma-linked', 'explicitly', 'UI-relevant', 'confirmation', 'escalation']) assert.match(text, new RegExp(phrase, 'i'));
});

test('planning profiles expose human-readable plan artifacts', async () => {
  const planner = await readFile(join(root, 'agents/rw-crm-components-planner.yaml'), 'utf8');
  const reviewer = await readFile(join(root, 'agents/rw-crm-plan-reviewer.yaml'), 'utf8');
  const workflow = await readFile(join(root, 'agents/rw-crm-workflow.yaml'), 'utf8');
  assert.match(planner, /plan_artifact/);
  assert.match(reviewer, /plan_artifact/);
  assert.match(workflow, /plan_artifact/);
});
