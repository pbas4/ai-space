import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { parseCliArgs } from "../src/cli/args.js";
import { main } from "../src/cli/main.js";
import { ExitCode } from "../src/domain/diagnostic.js";
import {
  buildFullIndex,
  type IndexSummary,
} from "../src/indexer/full.js";

interface TreeEntry {
  path: string;
  sha256: string;
}

async function snapshotTree(
  root: string,
  excludedRootNames: readonly string[],
): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];

  async function walk(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const child of children) {
      const absolute = path.join(directory, child.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (!relative.includes("/") && excludedRootNames.includes(relative)) continue;
      if (child.isDirectory()) {
        await walk(absolute);
      } else if (child.isFile()) {
        entries.push({
          path: relative,
          sha256: createHash("sha256").update(await readFile(absolute)).digest("hex"),
        });
      }
    }
  }

  await walk(root);
  return entries;
}

async function fixtureRepository(t: test.TestContext): Promise<string> {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "repo-graph-index-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "src"));
  await Promise.all([
    writeFile(
      path.join(repositoryRoot, "package.json"),
      `${JSON.stringify({ name: "fixture", private: true }, null, 2)}\n`,
    ),
    writeFile(
      path.join(repositoryRoot, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      path.join(repositoryRoot, "src/index.ts"),
      [
        "export class Greeter {",
        "  greet(): string { return 'hello'; }",
        "}",
        "export function run(greeter: Greeter): string {",
        "  return greeter.greet();",
        "}",
        "",
      ].join("\n"),
    ),
  ]);
  return repositoryRoot;
}

test("indexes a local fixture and writes only .repo-graph", async (t) => {
  const repositoryRoot = await fixtureRepository(t);
  const before = await snapshotTree(repositoryRoot, [".repo-graph"]);

  const result = await buildFullIndex(repositoryRoot, { format: "json" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.repository, await realpath(repositoryRoot));
  assert.equal(result.value.projects, 1);
  assert.equal(result.value.files, 1);
  assert.ok(result.value.nodes > 0);
  assert.ok(result.value.edges > 0);
  assert.equal(
    result.value.resolvedEdges + result.value.unresolvedEdges,
    result.value.edges,
  );
  assert.equal(result.value.diagnostics, 0);
  assert.equal(result.value.database, ".repo-graph/index.sqlite");
  assert.deepEqual(
    await snapshotTree(repositoryRoot, [".repo-graph"]),
    before,
  );

  const indexPath = path.join(repositoryRoot, ".repo-graph/index.sqlite");
  await access(indexPath);
  const database = new DatabaseSync(indexPath, { readOnly: true, allowExtension: false });
  t.after(() => database.close());
  const metadata = Object.fromEntries(
    (database.prepare("SELECT key, value FROM metadata ORDER BY key").all() as Array<{
      key: string;
      value: string;
    }>).map(({ key, value }) => [key, JSON.parse(value) as unknown]),
  );
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.toolVersion, "0.1.0");
  assert.equal(metadata.compilerVersion, "6.0.3");
  assert.match(String(metadata.contentHash), /^[a-f0-9]{64}$/u);
  assert.match(String(metadata.configHash), /^[a-f0-9]{64}$/u);
  assert.equal(metadata.complete, true);
});

test("index rejects a repository URL before filesystem work", async () => {
  const result = await buildFullIndex("https://host/repo.git", { format: "json" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.exitCode, ExitCode.InvalidInput);
    assert.equal(result.diagnostics[0]?.code, "LOCAL_PATH_REQUIRED");
  }
});

test("indexes configured-project omissions through an inferred project", async (t) => {
  const repositoryRoot = await fixtureRepository(t);
  await writeFile(
    path.join(repositoryRoot, "tsconfig.json"),
    `${JSON.stringify({ files: [] }, null, 2)}\n`,
  );

  const result = await buildFullIndex(repositoryRoot, { format: "json" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.projects, 2);
  assert.ok(result.value.nodes > 0);
  assert.ok(result.value.diagnostics > 0);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TS18002"));
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "SOURCE_NOT_IN_TSCONFIG" &&
        diagnostic.file === "src/index.ts" &&
        /include.*tsconfig/iu.test(diagnostic.message),
    ),
  );

  const database = new DatabaseSync(
    path.join(repositoryRoot, ".repo-graph/index.sqlite"),
    { readOnly: true, allowExtension: false },
  );
  t.after(() => database.close());
  const metadata = Object.fromEntries(
    (database.prepare("SELECT key, value FROM metadata").all() as Array<{
      key: string;
      value: string;
    }>).map(({ key, value }) => [key, JSON.parse(value) as unknown]),
  );
  assert.equal(metadata.complete, false);
  assert.deepEqual(
    database.prepare(
      "SELECT source_file, project_path FROM nodes WHERE kind = 'file'",
    ).all().map((row) => ({ ...row })),
    [{ source_file: "src/index.ts", project_path: "<inferred>" }],
  );
});

test("indexes discovered sources when the repository has no tsconfig", async (t) => {
  const repositoryRoot = await mkdtemp(
    path.join(tmpdir(), "repo-graph-index-unconfigured-"),
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(path.join(repositoryRoot, "src"));
  await writeFile(
    path.join(repositoryRoot, "src/index.ts"),
    "export const unconfigured = true;\n",
  );

  const result = await buildFullIndex(repositoryRoot, { format: "json" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.projects, 1);
  assert.equal(result.value.files, 1);
  assert.ok(result.value.nodes > 0);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "SOURCE_NOT_IN_TSCONFIG" &&
        diagnostic.file === "src/index.ts",
    ),
  );

  const database = new DatabaseSync(
    path.join(repositoryRoot, ".repo-graph/index.sqlite"),
    { readOnly: true, allowExtension: false },
  );
  t.after(() => database.close());
  assert.deepEqual(
    database.prepare(
      "SELECT source_file, project_path FROM nodes WHERE kind = 'file'",
    ).all().map((row) => ({ ...row })),
    [{ source_file: "src/index.ts", project_path: "<inferred>" }],
  );
  assert.equal(
    (database.prepare(
      "SELECT value FROM metadata WHERE key = 'complete'",
    ).get() as { value: string }).value,
    "false",
  );
});

test("resolves cross-project imports while assigning overlapping sources exactly once", async (t) => {
  const repositoryRoot = await mkdtemp(
    path.join(tmpdir(), "repo-graph-index-overlap-"),
  );
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await Promise.all([
    mkdir(path.join(repositoryRoot, "a")),
    mkdir(path.join(repositoryRoot, "src")),
    mkdir(path.join(repositoryRoot, "z")),
  ]);
  await Promise.all([
    writeFile(
      path.join(repositoryRoot, "a/tsconfig.json"),
      `${JSON.stringify({ files: ["../src/shared.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      path.join(repositoryRoot, "z/tsconfig.json"),
      `${JSON.stringify({ files: ["../src/shared.ts", "../src/consumer.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      path.join(repositoryRoot, "src/shared.ts"),
      "export const shared = true;\n",
    ),
    writeFile(
      path.join(repositoryRoot, "src/consumer.ts"),
      "import { shared } from './shared.js';\nexport const consumer = shared;\n",
    ),
  ]);

  const result = await buildFullIndex(repositoryRoot, { format: "json" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.projects, 2);
  assert.equal(result.value.files, 2);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "AMBIGUOUS_SOURCE_OWNERSHIP" &&
        diagnostic.file === "src/shared.ts" &&
        diagnostic.message.includes("a/tsconfig.json") &&
        diagnostic.message.includes("z/tsconfig.json"),
    ),
  );

  const database = new DatabaseSync(
    path.join(repositoryRoot, ".repo-graph/index.sqlite"),
    { readOnly: true, allowExtension: false },
  );
  t.after(() => database.close());
  assert.deepEqual(
    database.prepare(
      "SELECT source_file, project_path FROM nodes WHERE kind = 'file' ORDER BY source_file",
    ).all().map((row) => ({ ...row })),
    [
      { source_file: "src/consumer.ts", project_path: "z/tsconfig.json" },
      { source_file: "src/shared.ts", project_path: "a/tsconfig.json" },
    ],
  );
  assert.deepEqual(
    database.prepare(`
      SELECT
        edges.kind,
        edges.confidence,
        sources.source_file AS source_file,
        targets.source_file AS target_file,
        targets.kind AS target_kind
      FROM edges
      JOIN nodes AS sources ON sources.id = edges.source_id
      JOIN nodes AS targets ON targets.id = edges.target_id
      WHERE edges.kind = 'imports'
    `).all().map((row) => ({ ...row })),
    [{
      kind: "imports",
      confidence: "resolved",
      source_file: "src/consumer.ts",
      target_file: "src/shared.ts",
      target_kind: "file",
    }],
  );
  assert.equal(
    (database.prepare(
      "SELECT value FROM metadata WHERE key = 'complete'",
    ).get() as { value: string }).value,
    "false",
  );
});

test("parses explicit index and update commands with dependency-free options", () => {
  assert.deepEqual(parseCliArgs(["index"]), {
    ok: true,
    value: { command: "index", path: ".", format: "text" },
    diagnostics: [],
  });
  assert.deepEqual(parseCliArgs(["index", "fixture", "--format", "json"]), {
    ok: true,
    value: { command: "index", path: "fixture", format: "json" },
    diagnostics: [],
  });
  assert.deepEqual(parseCliArgs(["update", "fixture", "--format", "json"]), {
    ok: true,
    value: { command: "update", path: "fixture", format: "json" },
    diagnostics: [],
  });
  assert.equal(parseCliArgs(["index", "--format", "yaml"]).ok, false);
  assert.equal(parseCliArgs(["index", "one", "two"]).ok, false);
  assert.equal(parseCliArgs(["unknown"]).ok, false);
});

test("parses connect paths and rejects indexing-only options", () => {
  assert.deepEqual(parseCliArgs(["connect"]), {
    ok: true,
    value: { command: "connect", path: ".", format: "text" },
    diagnostics: [],
  });
  assert.deepEqual(parseCliArgs(["connect", "fixture", "--format", "json"]), {
    ok: true,
    value: { command: "connect", path: "fixture", format: "json" },
    diagnostics: [],
  });
  assert.equal(parseCliArgs(["connect", "--budget", "10"]).ok, false);
  assert.equal(parseCliArgs(["connect", "--depth", "2"]).ok, false);
  assert.equal(parseCliArgs(["connect", "one", "two"]).ok, false);
});

test("main connect creates graph, agent skill, guidance, and ignore entry", async (t) => {
  const repositoryRoot = await fixtureRepository(t);
  const before = await snapshotTree(repositoryRoot, [".repo-graph", ".agents", "AGENTS.md", ".gitignore"]);
  let stdout = "";
  let stderr = "";
  const exitCode = await main(["connect", repositoryRoot], {
    cwd: process.cwd(),
    stdout: (value) => { stdout += value; },
    stderr: (value) => { stderr += value; },
  });
  assert.equal(exitCode, ExitCode.Ok);
  assert.equal(stderr, "");
  assert.match(stdout, /Connected repository/u);
  await access(path.join(repositoryRoot, ".repo-graph", "index.sqlite"));
  await access(path.join(repositoryRoot, ".agents", "skills", "repo-graph", "SKILL.md"));
  await access(path.join(repositoryRoot, "AGENTS.md"));
  await access(path.join(repositoryRoot, ".gitignore"));
  assert.deepEqual(await snapshotTree(repositoryRoot, [".repo-graph", ".agents", "AGENTS.md", ".gitignore"]), before);
});

test("main renders stable JSON and maps invalid local input to exit code 2", async (t) => {
  const repositoryRoot = await fixtureRepository(t);
  let stdout = "";
  let stderr = "";
  const exitCode = await main(
    ["index", repositoryRoot, "--format", "json"],
    {
      cwd: process.cwd(),
      stdout: (value) => { stdout += value; },
      stderr: (value) => { stderr += value; },
    },
  );

  assert.equal(exitCode, ExitCode.Ok);
  assert.equal(stderr, "");
  const summary = JSON.parse(stdout) as IndexSummary;
  assert.deepEqual(Object.keys(summary), [
    "repository",
    "projects",
    "files",
    "nodes",
    "edges",
    "resolvedEdges",
    "unresolvedEdges",
    "diagnostics",
    "database",
  ]);
  assert.equal(stdout, `${JSON.stringify(summary, null, 2)}\n`);

  stdout = "";
  stderr = "";
  const invalidExitCode = await main(
    ["index", "https://host/repo.git", "--format", "json"],
    {
      cwd: repositoryRoot,
      stdout: (value) => { stdout += value; },
      stderr: (value) => { stderr += value; },
    },
  );
  assert.equal(invalidExitCode, ExitCode.InvalidInput);
  assert.equal(stdout, "");
  assert.match(stderr, /^LOCAL_PATH_REQUIRED: /u);
  assert.doesNotMatch(stderr, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u);
});

test("the executable CLI provides global help and rejects remote index input", () => {
  const cliPath = path.resolve("dist/src/cli/main.js");
  const help = spawnSync(process.execPath, [cliPath, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, ExitCode.Ok);
  assert.match(help.stdout, /^Usage: repo-graph index/u);
  assert.match(help.stdout, /repo-graph update \[path\]/u);
  assert.match(help.stdout, /update \[path\].*reuse an unchanged index.*atomic full rebuild/isu);
  assert.equal(help.stderr, "");

  const remote = spawnSync(
    process.execPath,
    [cliPath, "index", "https://host/repo.git", "--format", "json"],
    { encoding: "utf8" },
  );
  assert.equal(remote.status, ExitCode.InvalidInput);
  assert.equal(remote.stdout, "");
  assert.match(remote.stderr, /^LOCAL_PATH_REQUIRED: /u);
});
