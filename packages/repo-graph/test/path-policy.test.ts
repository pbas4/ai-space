import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertContainedPath,
  resolveLocalRepository,
} from "../src/local/path-policy.js";

const remoteInputs = [
  "https://example.com/a.git",
  "ssh://host/a",
  "git@host:a.git",
  "host:a.git",
  "file:///tmp/a",
  "npm:pkg",
  "@scope/pkg",
];

for (const input of remoteInputs) {
  test(`rejects remote-shaped input ${input}`, async () => {
    const result = await resolveLocalRepository(input, process.cwd());

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.diagnostics[0]?.code, "LOCAL_PATH_REQUIRED");
    }
  });
}

test("resolves an existing local directory to canonical paths", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "repo-graph-path-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await mkdir(join(parent, "repository"));

  const result = await resolveLocalRepository("repository", parent);

  assert.equal(result.ok, true);
  if (result.ok) {
    const canonicalRoot = await realpath(join(parent, "repository"));
    assert.deepEqual(result.value, {
      root: canonicalRoot,
      dataDir: join(canonicalRoot, ".repo-graph"),
    });
  }
});

test("rejects a nonexistent local directory", async () => {
  const result = await resolveLocalRepository(
    "definitely-not-a-repository",
    process.cwd(),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics[0]?.code, "LOCAL_PATH_NOT_FOUND");
  }
});

test("rejects an existing file as a repository root", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "repo-graph-file-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const file = join(parent, "package.json");
  await writeFile(file, "{}\n");

  const result = await resolveLocalRepository(file, parent);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics[0]?.code, "LOCAL_DIRECTORY_REQUIRED");
  }
});

test("returns the canonical path for a contained candidate", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "repo-graph-contained-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const candidate = join(repoRoot, "src");
  await mkdir(candidate);

  const result = await assertContainedPath(repoRoot, candidate);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, await realpath(candidate));
  }
});

test("rejects a symlink whose target escapes the root", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "repo-graph-symlink-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const repoRoot = join(parent, "repository");
  const outside = join(parent, "outside.ts");
  const escapingSymlink = join(repoRoot, "escape.ts");
  await mkdir(repoRoot);
  await writeFile(outside, "export const outside = true;\n");
  await symlink(outside, escapingSymlink);

  const result = await assertContainedPath(repoRoot, escapingSymlink);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics[0]?.code, "PATH_OUTSIDE_REPOSITORY");
  }
});
