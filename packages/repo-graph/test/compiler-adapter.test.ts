import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createPrograms } from "../src/compiler/create-programs.js";
import { loadCompiler } from "../src/compiler/load-compiler.js";
import { discoverRepository } from "../src/discovery/discover.js";
import { ExitCode } from "../src/domain/diagnostic.js";
import { resolveLocalRepository } from "../src/local/path-policy.js";

const fixtureRootWithoutNodeModules = resolve("test/fixtures/workspace");

declare global {
  type RepoGraphFixtureNumber = number;
}

test("uses bundled 6.0.3 when the repository has no local compiler", async () => {
  const result = await loadCompiler(fixtureRootWithoutNodeModules);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.version, "6.0.3");
});

test("never executes a TypeScript package from the indexed repository", async (t) => {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "repo-graph-supported-typescript-"),
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const compilerRoot = join(repositoryRoot, "node_modules/typescript");
  await mkdir(compilerRoot, { recursive: true });
  await Promise.all([
    writeFile(join(repositoryRoot, "package.json"), "{}\n"),
    writeFile(
      join(compilerRoot, "package.json"),
      JSON.stringify({
        name: "typescript",
        version: "5.4.0",
        main: "index.cjs",
      }),
    ),
    writeFile(
      join(compilerRoot, "index.cjs"),
      "throw new Error('repository TypeScript was executed');\n",
    ),
  ]);

  const result = await loadCompiler(repositoryRoot);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.source, "bundled");
    assert.equal(result.value.version, "6.0.3");
  }
});

test("ignores unsupported repository TypeScript metadata", async (t) => {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "repo-graph-unsupported-typescript-"),
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  const compilerRoot = join(repositoryRoot, "node_modules/typescript");
  await mkdir(compilerRoot, { recursive: true });
  await Promise.all([
    writeFile(join(repositoryRoot, "package.json"), "{}\n"),
    writeFile(
      join(compilerRoot, "package.json"),
      JSON.stringify({ name: "typescript", version: "7.0.2" }),
    ),
  ]);

  const result = await loadCompiler(repositoryRoot);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.source, "bundled");
    assert.equal(result.value.version, "6.0.3");
  }
});

test("retains a program with ordinary type errors", async () => {
  const repository = await resolveLocalRepository(
    fixtureRootWithoutNodeModules,
    process.cwd(),
  );
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const discovery = await discoverRepository(repository.value);
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;
  const compiler = await loadCompiler(fixtureRootWithoutNodeModules);
  assert.equal(compiler.ok, true);
  if (!compiler.ok) return;

  const result = await createPrograms(compiler.value, discovery.value);

  assert.equal(result.ok, true);
  if (result.ok) {
    const brokenProject = result.value.find((project) =>
      project.sourceFiles.some((file) => file.fileName.endsWith("broken.ts")),
    );
    assert.ok(brokenProject);
    assert.ok(
      brokenProject.diagnostics.some(
        (diagnostic) =>
          diagnostic.file === "packages/api/src/broken.ts" &&
          diagnostic.level === "error",
      ),
    );
  }
});

test("keeps diagnostics for repository files whose names start with two dots", async (t) => {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "repo-graph-dotdot-file-"),
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(repositoryRoot, "package.json"), "{}\n"),
    writeFile(
      join(repositoryRoot, "tsconfig.json"),
      JSON.stringify({ files: ["..inside.ts"] }),
    ),
    writeFile(
      join(repositoryRoot, "..inside.ts"),
      "export const value: MissingProjectType = 1;\n",
    ),
  ]);
  const repository = await resolveLocalRepository(repositoryRoot, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const discovery = await discoverRepository(repository.value);
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;
  const compiler = await loadCompiler(repositoryRoot);
  assert.equal(compiler.ok, true);
  if (!compiler.ok) return;

  const result = await createPrograms(compiler.value, discovery.value);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(
      result.diagnostics.some((diagnostic) => diagnostic.file === "..inside.ts"),
    );
  }
});
