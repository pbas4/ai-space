import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { discoverRepository } from "../src/discovery/discover.js";
import { resolveLocalRepository } from "../src/local/path-policy.js";

test("discovers workspace manifests and source files without changing manifests", async () => {
  const fixtureRoot = resolve("test/fixtures/workspace");
  const manifestPaths = [
    join(fixtureRoot, "package.json"),
    join(fixtureRoot, "tsconfig.json"),
    join(fixtureRoot, "packages/api/tsconfig.json"),
  ];
  const before = await Promise.all(manifestPaths.map((path) => readFile(path)));
  const repository = await resolveLocalRepository(fixtureRoot, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;

  const result = await discoverRepository(repository.value);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.repositoryRoot, repository.value.root);
    assert.deepEqual(result.value.packageJsonFiles, ["package.json"]);
    assert.deepEqual(result.value.tsconfigFiles, [
      "packages/api/tsconfig.json",
      "tsconfig.json",
    ]);
    assert.deepEqual(result.value.sourceFiles, [
      "packages/api/src/broken.ts",
      "packages/api/src/index.ts",
    ]);
    assert.deepEqual(result.value.diagnostics, []);
  }

  const after = await Promise.all(manifestPaths.map((path) => readFile(path)));
  assert.equal(after.length, before.length);
  after.forEach((contents, index) => {
    assert.deepEqual(contents, before[index]);
  });
});

test("applies default exclusions and root and nested gitignore rules", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "repo-graph-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await Promise.all([
    mkdir(join(root, "src"), { recursive: true }),
    mkdir(join(root, "dist"), { recursive: true }),
    mkdir(join(root, "node_modules/pkg"), { recursive: true }),
    mkdir(join(root, "packages/api/generated"), { recursive: true }),
    mkdir(join(root, "packages/api/ignored"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, ".gitignore"), "# root rules\n\n/root-only.ts\n"),
    writeFile(join(root, "src/main.ts"), "export const main = true;\n"),
    writeFile(join(root, "root-only.ts"), "export const ignored = true;\n"),
    writeFile(join(root, "bundle.min.js"), "export const minified=true;\n"),
    writeFile(join(root, "dist/generated.js"), "export const built = true;\n"),
    writeFile(join(root, "node_modules/pkg/index.js"), "module.exports = {};\n"),
    writeFile(
      join(root, "packages/api/.gitignore"),
      "private.ts\nignored/**\n!ignored/keep.ts\ntemp?.js\n",
    ),
    writeFile(join(root, "packages/api/root-only.ts"), "export {};\n"),
    writeFile(join(root, "packages/api/private.ts"), "export {};\n"),
    writeFile(join(root, "packages/api/generated/default.ts"), "export {};\n"),
    writeFile(join(root, "packages/api/ignored/drop.ts"), "export {};\n"),
    writeFile(join(root, "packages/api/ignored/keep.ts"), "export {};\n"),
    writeFile(join(root, "packages/api/temp1.js"), "export {};\n"),
  ]);

  const repository = await resolveLocalRepository(root, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const result = await discoverRepository(repository.value);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.sourceFiles, [
      "packages/api/ignored/keep.ts",
      "packages/api/root-only.ts",
      "src/main.ts",
    ]);
    assert.ok(result.value.ignoredFiles >= 6);
  }
});

test("prunes an ignored directory before descendant negations", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "repo-graph-pruned-directory-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "ignored"), { recursive: true });
  await Promise.all([
    writeFile(join(root, ".gitignore"), "ignored/\n!ignored/keep.ts\n"),
    writeFile(join(root, "ignored/drop.ts"), "export const drop = true;\n"),
    writeFile(join(root, "ignored/keep.ts"), "export const keep = true;\n"),
    writeFile(join(root, "visible.ts"), "export const visible = true;\n"),
  ]);

  const repository = await resolveLocalRepository(root, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const result = await discoverRepository(repository.value);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.sourceFiles, ["visible.ts"]);
  }
});

test("does not follow directory symlinks during discovery", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "repo-graph-directory-link-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "repository");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src/index.ts"), "export const value = 1;\n");
  await symlink(join(root, "src"), join(root, "linked-src"));

  const repository = await resolveLocalRepository(root, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const result = await discoverRepository(repository.value);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.sourceFiles, ["src/index.ts"]);
  }
});
