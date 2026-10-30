import { access, readFile, readlink, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const claude = await readJson('.claude-plugin/marketplace.json');
const codex = await readJson('.agents/plugins/marketplace.json');
const expectedNames = ['rw-crm', 'create-task-plan', 'book-summary', 'react-vertical-slices', 'retro'];
assert(claude.name === 'ai-space' && codex.name === 'ai-space', 'marketplace name must be ai-space');
assert(JSON.stringify(claude.plugins.map(({ name }) => name)) === JSON.stringify(expectedNames), 'Claude plugin entries are invalid');
assert(JSON.stringify(codex.plugins.map(({ name }) => name)) === JSON.stringify(expectedNames), 'Codex plugin entries are invalid');

for (const plugin of claude.plugins) {
  await access(resolve(root, plugin.source, '.claude-plugin/plugin.json'));
}

for (const plugin of codex.plugins) {
  const sourcePath = resolve(root, plugin.source.path);
  const manifest = await readJson(`${plugin.source.path}/.codex-plugin/plugin.json`);
  await access(resolve(sourcePath, '.codex-plugin/plugin.json'));
  assert(plugin.version === manifest.version, `${plugin.name}: marketplace version must match Codex manifest`);
  assert(plugin.description === manifest.description, `${plugin.name}: marketplace description must match Codex manifest`);
  assert(plugin.policy?.installation === 'AVAILABLE', `${plugin.name}: invalid installation policy`);
  assert(plugin.policy?.authentication === 'ON_INSTALL', `${plugin.name}: invalid authentication policy`);
  assert(typeof plugin.category === 'string', `${plugin.name}: category is required`);
}

// Retro ships equivalent host manifests. Other packages may intentionally use
// host-specific metadata/version suffixes, so do not impose cross-host equality.
const retroClaude = claude.plugins.find(({ name }) => name === 'retro');
const retroCodex = codex.plugins.find(({ name }) => name === 'retro');
assert(retroClaude.source === './packages/retro', 'retro: invalid Claude source');
assert(retroCodex.source.source === 'local' && retroCodex.source.path === './packages/retro', 'retro: invalid Codex source');
const retroManifests = await Promise.all([
  readJson('packages/retro/.claude-plugin/plugin.json'),
  readJson('packages/retro/.codex-plugin/plugin.json'),
]);
assert(retroManifests.every(({ name }) => name === 'retro'), 'retro: invalid manifest name');
assert(retroManifests[0].version === retroManifests[1].version, 'retro: host manifest versions must match');
for (const [entry, manifest] of [[retroClaude, retroManifests[0]], [retroCodex, retroManifests[1]]]) {
  assert(entry.version === manifest.version, 'retro: marketplace version must match host manifest');
  assert(entry.description === manifest.description, 'retro: marketplace description must match host manifest');
  assert(entry.category === 'Developer Tools', 'retro: invalid marketplace category');
}
const retroAlias = resolve(root, '.agents/plugins/plugins/retro');
assert(await readlink(retroAlias) === '../../../packages/retro', 'retro: invalid marketplace alias target');
assert(await realpath(retroAlias) === resolve(root, 'packages/retro'), 'retro: marketplace alias must resolve to package');

console.log(`Claude marketplace: ${expectedNames.length} plugins valid`);
console.log(`Codex marketplace: ${expectedNames.length} plugins valid`);
