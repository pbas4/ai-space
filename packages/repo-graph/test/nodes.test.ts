import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createPrograms } from "../src/compiler/create-programs.js";
import { loadCompiler } from "../src/compiler/load-compiler.js";
import { discoverRepository } from "../src/discovery/discover.js";
import { extractNodes } from "../src/extract/nodes.js";
import { resolveLocalRepository } from "../src/local/path-policy.js";

const fixtureRoot = resolve("test/fixtures/symbols");

test("extracts exported and internal declarations with evidence", async () => {
  const repository = await resolveLocalRepository(fixtureRoot, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;

  const discovery = await discoverRepository(repository.value);
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;

  const compiler = await loadCompiler(fixtureRoot);
  assert.equal(compiler.ok, true);
  if (!compiler.ok) return;

  const programs = await createPrograms(compiler.value, discovery.value);
  assert.equal(programs.ok, true);
  if (!programs.ok) return;
  const project = programs.value[0];
  assert.ok(project);

  const fragments = extractNodes(project, fixtureRoot);
  assert.equal(fragments.length, 1);
  const fragment = fragments[0];
  assert.ok(fragment);

  assert.deepEqual(
    fragment.nodes.map(({ kind, qualifiedName, exported }) => ({
      kind,
      qualifiedName,
      exported,
    })),
    [
      { kind: "file", qualifiedName: "src/symbols.tsx", exported: false },
      { kind: "interface", qualifiedName: "User", exported: true },
      { kind: "class", qualifiedName: "UserService", exported: true },
      { kind: "method", qualifiedName: "UserService.find", exported: false },
      { kind: "function", qualifiedName: "UserCard", exported: true },
      { kind: "constant", qualifiedName: "cache", exported: false },
    ],
  );
  assert.equal(fragment.ownerFile, "src/symbols.tsx");
  assert.deepEqual(fragment.edges, []);
  assert.deepEqual(fragment.diagnostics, project.diagnostics);
  assert.ok(fragment.nodes.every((node) => !node.sourceFile.startsWith("/")));
  assert.ok(fragment.nodes.every((node) => /^[a-f0-9]{64}$/u.test(node.id)));
  assert.ok(
    fragment.nodes.every(
      (node) =>
        node.label.length > 0 &&
        node.packageName === null &&
        node.projectPath === "tsconfig.json" &&
        node.summary.length <= 500,
    ),
  );
  assert.ok(
    fragment.nodes.every(
      (node) =>
        node.startLine > 0 &&
        node.startColumn > 0 &&
        node.endLine >= node.startLine &&
        node.endColumn > 0,
    ),
  );
  assert.ok(fragment.nodes.every((node) => !node.signature.includes("return cache")));
  const persistedNodes = JSON.stringify(fragment.nodes);
  assert.ok(!persistedNodes.includes(fixtureRoot));
  assert.ok(!persistedNodes.includes("return <article>"));

  const userCard = fragment.nodes.find(
    (node) => node.qualifiedName === "UserCard",
  );
  assert.ok(userCard);
  assert.equal(userCard.summary.length, 500);
});

test("extracts every approved declaration syntax kind", async (t) => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "repo-graph-nodes-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(join(repositoryRoot, "src"));
  await Promise.all([
    writeFile(
      join(repositoryRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "NodeNext" },
        include: ["src/**/*"],
      }),
    ),
    writeFile(
      join(repositoryRoot, "src/declarations.ts"),
      [
        "type Identifier = string;",
        "enum Role { User }",
        "class Store {",
        "  value = 0;",
        "  constructor() {}",
        "}",
        "let count = 0;",
        'test("stores values", () => count);',
        "",
      ].join("\n"),
    ),
    writeFile(join(repositoryRoot, "src/z.ts"), "export const tail = true;\n"),
  ]);

  const repository = await resolveLocalRepository(repositoryRoot, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const discovery = await discoverRepository(repository.value);
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;
  const compiler = await loadCompiler(repository.value.root);
  assert.equal(compiler.ok, true);
  if (!compiler.ok) return;
  const programs = await createPrograms(compiler.value, discovery.value);
  assert.equal(programs.ok, true);
  if (!programs.ok) return;
  const project = programs.value[0];
  assert.ok(project);

  const fragments = extractNodes(
    { ...project, sourceFiles: [...project.sourceFiles].reverse() },
    repository.value.root,
  );
  assert.deepEqual(
    fragments.map((fragment) => fragment.ownerFile),
    ["src/declarations.ts", "src/z.ts"],
  );
  const declarations = fragments[0];
  assert.ok(declarations);

  assert.deepEqual(
    declarations.nodes.map(({ kind, qualifiedName }) => ({
      kind,
      qualifiedName,
    })),
    [
      { kind: "file", qualifiedName: "src/declarations.ts" },
      { kind: "type_alias", qualifiedName: "Identifier" },
      { kind: "enum", qualifiedName: "Role" },
      { kind: "class", qualifiedName: "Store" },
      { kind: "property", qualifiedName: "Store.value" },
      { kind: "constructor", qualifiedName: "Store.constructor" },
      { kind: "variable", qualifiedName: "count" },
      { kind: "test", qualifiedName: "stores values" },
    ],
  );
});

test("classifies declarations exported through module export statements", async (t) => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "repo-graph-exports-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(join(repositoryRoot, "src"));
  await Promise.all([
    writeFile(
      join(repositoryRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "NodeNext" },
        include: ["src/**/*"],
      }),
    ),
    writeFile(
      join(repositoryRoot, "src/exports.ts"),
      [
        "class NamedExport {}",
        "export { NamedExport };",
        "class DefaultExport {}",
        "export default DefaultExport;",
        "class Internal {}",
        "",
      ].join("\n"),
    ),
  ]);

  const repository = await resolveLocalRepository(repositoryRoot, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const discovery = await discoverRepository(repository.value);
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;
  const compiler = await loadCompiler(repository.value.root);
  assert.equal(compiler.ok, true);
  if (!compiler.ok) return;
  const programs = await createPrograms(compiler.value, discovery.value);
  assert.equal(programs.ok, true);
  if (!programs.ok) return;
  const project = programs.value[0];
  assert.ok(project);

  const fragment = extractNodes(project, repository.value.root)[0];
  assert.ok(fragment);
  assert.deepEqual(
    fragment.nodes
      .filter((node) => node.kind === "class")
      .map(({ qualifiedName, exported }) => ({ qualifiedName, exported })),
    [
      { qualifiedName: "NamedExport", exported: true },
      { qualifiedName: "DefaultExport", exported: true },
      { qualifiedName: "Internal", exported: false },
    ],
  );
});

test("sorts fragment owner files by code units", async (t) => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "repo-graph-order-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(join(repositoryRoot, "src"));
  await Promise.all([
    writeFile(
      join(repositoryRoot, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "NodeNext" },
        include: ["src/**/*"],
      }),
    ),
    writeFile(join(repositoryRoot, "src/Z.ts"), "export const upper = true;\n"),
    writeFile(join(repositoryRoot, "src/a.ts"), "export const lower = true;\n"),
  ]);

  const repository = await resolveLocalRepository(repositoryRoot, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const discovery = await discoverRepository(repository.value);
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;
  const compiler = await loadCompiler(repository.value.root);
  assert.equal(compiler.ok, true);
  if (!compiler.ok) return;
  const programs = await createPrograms(compiler.value, discovery.value);
  assert.equal(programs.ok, true);
  if (!programs.ok) return;
  const project = programs.value[0];
  assert.ok(project);

  const fragments = extractNodes(
    { ...project, sourceFiles: [...project.sourceFiles].reverse() },
    repository.value.root,
  );
  assert.deepEqual(
    fragments.map((fragment) => fragment.ownerFile),
    ["src/Z.ts", "src/a.ts"],
  );
});
