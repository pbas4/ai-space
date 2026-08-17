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
  'schemas/learning-ledger.schema.json'
];

for (const relativePath of required) {
  await readFile(join(root, relativePath), 'utf8');
}

const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
if (manifest.name !== 'rw-crm-components-engineer') throw new Error('invalid plugin name');
console.log('RW CRM Components Engineer package contract: PASS');
