import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  '.codex-plugin/plugin.json',
  'package.json',
  'agents/rw-crm-components-engineer.yaml',
  'skills/rw-crm-components-engineer/SKILL.md',
  'schemas/context-envelope.schema.json',
  'schemas/engineer-result.schema.json',
  'schemas/learning-ledger.schema.json',
  'references/workflow.md',
  'references/rw-conventions.md',
  'references/create-task-plan-consumer-contract.md',
  'test/fixtures/new-component.json',
  'test/fixtures/bug-fix.json',
  'test/fixtures/feature-extension.json',
  'test/fixtures/figma-conflict.json',
  'test/fixtures/approved-correction.json'
];

for (const relativePath of required) {
  await readFile(join(root, relativePath), 'utf8');
}

const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
if (manifest.name !== 'rw-crm') throw new Error('invalid plugin name');
console.log('RW CRM package contract: PASS');
