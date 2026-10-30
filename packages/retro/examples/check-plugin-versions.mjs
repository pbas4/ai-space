import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// SemVer 2.0.0: numeric identifiers have no leading zeros (except build metadata).
const numeric = '(?:0|[1-9][0-9]*)';
const prerelease = `(?:${numeric}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const semver = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);

async function readVersion(path) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
  if (typeof manifest?.version !== 'string' || !semver.test(manifest.version)) {
    throw new Error(`${path}: invalid or missing SemVer version`);
  }
  return manifest.version;
}

if (process.argv.length !== 3 || !process.argv[2]) {
  console.error('Usage: node examples/check-plugin-versions.mjs <package-directory>');
  process.exitCode = 1;
} else {
  const paths = ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']
    .map((path) => resolve(process.argv[2], path));
  try {
    const versions = [];
    for (const path of paths) {
      versions.push(await readVersion(path));
      console.log(`Checked ${path}: ${versions.at(-1)}`);
    }
    if (versions[0] !== versions[1]) {
      throw new Error(`Version mismatch: ${paths[0]} (${versions[0]}) != ${paths[1]} (${versions[1]})`);
    }
    console.log(`Manifest versions match: ${versions[0]}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
