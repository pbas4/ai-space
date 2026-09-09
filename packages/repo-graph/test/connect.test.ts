import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { connectRepository } from "../src/commands/connect.js";
import { ExitCode } from "../src/domain/diagnostic.js";

async function fixtureRepository(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "repo-graph-connect-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src"));
  await Promise.all([
    writeFile(path.join(root, "package.json"), '{"name":"connect-fixture","private":true}\n'),
    writeFile(path.join(root, "tsconfig.json"), '{"compilerOptions":{"strict":true},"include":["src/**/*.ts"]}\n'),
    writeFile(path.join(root, "src", "index.ts"), "export const connected = true;\n"),
  ]);
  return root;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

test("connect creates the index and installs repository instructions", async (t) => {
  const root = await fixtureRepository(t);

  const result = await connectRepository(root, process.cwd());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.repository.root, await realpath(root));
  assert.equal(result.value.index.database, ".repo-graph/index.sqlite");
  assert.equal(result.value.reused, false);
  assert.equal(result.value.skill.changed, true);
  assert.deepEqual(result.value.skill.paths.sort(), [".gitignore", "AGENTS.md", ".agents/skills/repo-graph/SKILL.md"].sort());
  assert.equal(await exists(path.join(root, ".repo-graph", "index.sqlite")), true);
  assert.match(await readFile(path.join(root, "AGENTS.md"), "utf8"), /repo-graph:start/u);
  assert.equal(await exists(path.join(root, ".agents/skills/repo-graph/SKILL.md")), true);
  assert.match(await readFile(path.join(root, ".gitignore"), "utf8"), /\.repo-graph\//u);
});

test("connect reuses an unchanged index and makes no skill changes", async (t) => {
  const root = await fixtureRepository(t);

  const first = await connectRepository(root, process.cwd());
  const second = await connectRepository(root, process.cwd());

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.reused, true);
  assert.equal(second.value.index.reused, true);
  assert.equal(second.value.skill.changed, false);
  assert.deepEqual(second.value.skill.paths, []);
});

test("connect rejects a missing local path", async () => {
  const result = await connectRepository("./does-not-exist", process.cwd());

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.exitCode, ExitCode.InvalidInput);
  assert.equal(result.diagnostics[0]?.code, "LOCAL_PATH_NOT_FOUND");
});

test("connect does not create an index when skill installation is unsafe", async (t) => {
  const root = await fixtureRepository(t);
  await writeFile(
    path.join(root, "AGENTS.md"),
    "<!-- repo-graph:start -->\nmissing end marker\n",
  );

  const result = await connectRepository(root, process.cwd());

  assert.equal(result.ok, false);
  assert.equal(await exists(path.join(root, ".repo-graph", "index.sqlite")), false);
});
