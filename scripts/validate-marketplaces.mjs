import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const claude = await readJson('.claude-plugin/marketplace.json');
const codex = await readJson('.agents/plugins/marketplace.json');
const expectedNames = ['rw-crm', 'create-task-plan', 'book-summary'];
assert(claude.name === 'ai-space' && codex.name === 'ai-space', 'marketplace name must be ai-space');
assert(JSON.stringify(claude.plugins.map(({ name }) => name)) === JSON.stringify(expectedNames), 'Claude plugin entries are invalid');
assert(JSON.stringify(codex.plugins.map(({ name }) => name)) === JSON.stringify(expectedNames), 'Codex plugin entries are invalid');

for (const plugin of claude.plugins) {
  await access(resolve(root, plugin.source, '.claude-plugin/plugin.json'));
}

for (const plugin of codex.plugins) {
  const sourcePath = resolve(root, plugin.source.path);
  await access(resolve(sourcePath, '.codex-plugin/plugin.json'));
  assert(plugin.policy?.installation === 'AVAILABLE', `${plugin.name}: invalid installation policy`);
  assert(plugin.policy?.authentication === 'ON_INSTALL', `${plugin.name}: invalid authentication policy`);
  assert(typeof plugin.category === 'string', `${plugin.name}: category is required`);
}

console.log('Claude marketplace: 3 plugins valid');
console.log('Codex marketplace: 3 plugins valid');
