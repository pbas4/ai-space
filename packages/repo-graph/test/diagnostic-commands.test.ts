import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { main } from "../src/cli/main.js";
import { runDoctor } from "../src/commands/doctor.js";
import { getStats } from "../src/commands/stats.js";
import { getStatus } from "../src/commands/status.js";
import { ExitCode } from "../src/domain/diagnostic.js";
import { buildFullIndex } from "../src/indexer/full.js";

async function fixtureRepository(t: test.TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "repo-graph-diagnostics-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src"));
  await Promise.all([
    writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "diagnostic-fixture", private: true }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, "src/index.ts"),
      [
        "export function value(): number { return 1; }",
        "export function doubled(): number { return value() * 2; }",
        "",
      ].join("\n"),
    ),
    writeFile(path.join(root, ".gitignore"), "src/ignored.ts\n"),
    writeFile(path.join(root, "src/ignored.ts"), "export const ignored = true;\n"),
  ]);
  return root;
}

function editMetadata(root: string, key: string, value: unknown): void {
  const database = new DatabaseSync(path.join(root, ".repo-graph/index.sqlite"), {
    allowExtension: false,
  });
  try {
    database.prepare("UPDATE metadata SET value = ? WHERE key = ?").run(
      JSON.stringify(value),
      key,
    );
  } finally {
    database.close();
  }
}

async function invoke(
  root: string,
  args: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const exitCode = await main(args, {
    cwd: root,
    stdout: (value) => { stdout += value; },
    stderr: (value) => { stderr += value; },
  });
  return { exitCode, stdout, stderr };
}

test("status detects missing, current, and stale indexes without writing", async (t) => {
  const root = await fixtureRepository(t);
  const dataDirectory = path.join(root, ".repo-graph");

  const missing = await getStatus(root);
  assert.equal(missing.state, "missing");
  await assert.rejects(stat(dataDirectory), { code: "ENOENT" });

  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
  const indexPath = path.join(dataDirectory, "index.sqlite");
  const before = await readFile(indexPath);
  const current = await getStatus(root);
  assert.equal(current.state, "current");
  assert.equal(current.contentHashMatches, true);
  assert.equal(current.configHashMatches, true);

  await appendFile(
    path.join(root, "src/index.ts"),
    "\nexport const changed = true;\n",
  );
  const stale = await getStatus(root);
  assert.equal(stale.state, "stale");
  assert.equal(stale.contentHashMatches, false);
  assert.deepEqual(await readFile(indexPath), before);
});

test("status distinguishes incompatible and corrupt indexes", async (t) => {
  await t.test("incompatible tool metadata", async (t) => {
    const root = await fixtureRepository(t);
    assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
    editMetadata(root, "toolVersion", "999.0.0");
    assert.equal((await getStatus(root)).state, "incompatible");
  });

  await t.test("corrupt sqlite", async (t) => {
    const root = await fixtureRepository(t);
    assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
    await writeFile(path.join(root, ".repo-graph/index.sqlite"), "not sqlite\n");
    assert.equal((await getStatus(root)).state, "corrupt");
  });
});

test("doctor reports extraction coverage, privacy, and database health", async (t) => {
  const root = await fixtureRepository(t);
  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);

  const report = await runDoctor(root);

  assert.deepEqual(Object.keys(report), [
    "repository",
    "state",
    "compiler",
    "configuration",
    "coverage",
    "privacy",
    "foreignKeys",
  ]);
  assert.equal(report.state, "current");
  assert.equal(typeof report.compiler.version, "string");
  assert.equal(report.compiler.compatible, true);
  assert.equal(typeof report.configuration.projects, "number");
  assert.ok(Array.isArray(report.configuration.projectReferences));
  assert.ok(Array.isArray(report.configuration.configErrors));
  assert.equal(typeof report.coverage.indexedFiles, "number");
  assert.equal(typeof report.coverage.unresolvedEdgeRatio, "number");
  assert.ok(report.coverage.unresolvedEdgeRatio >= 0);
  assert.ok(report.coverage.unresolvedEdgeRatio <= 1);
  assert.ok(report.coverage.skippedFilesByReason.ignored >= 1);
  assert.equal(typeof report.coverage.parseFailures, "number");
  assert.equal(report.privacy.absolutePaths, 0);
  assert.deepEqual(report.privacy.violations, []);
  assert.equal(report.foreignKeys.healthy, true);
  assert.deepEqual(report.foreignKeys.violations, []);
});

test("doctor scans every persisted path column for privacy violations", async (t) => {
  const root = await fixtureRepository(t);
  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
  const absoluteFile = path.join(root, "private-source.ts");
  const absoluteProject = path.join(root, "private-tsconfig.json");
  const database = new DatabaseSync(path.join(root, ".repo-graph/index.sqlite"), {
    allowExtension: false,
  });
  try {
    database.exec("PRAGMA foreign_keys = ON");
    database.prepare(
      "INSERT INTO files (path, project_path, package_name) VALUES (?, ?, NULL)",
    ).run(absoluteFile, absoluteProject);
    database.prepare(
      "INSERT INTO diagnostics (code, level, message, file) VALUES (?, ?, ?, ?)",
    ).run("PRIVATE_PATH", "error", "private path", absoluteFile);
    database.prepare(`
      UPDATE nodes
      SET source_file = ?, project_path = ?
      WHERE id = (SELECT id FROM nodes ORDER BY id LIMIT 1)
    `).run(absoluteFile, absoluteProject);
    database.prepare(`
      UPDATE edges
      SET evidence_file = ?, diagnostic_file = ?
      WHERE id = (SELECT id FROM edges ORDER BY id LIMIT 1)
    `).run(absoluteFile, absoluteFile);
  } finally {
    database.close();
  }
  const before = await readFile(path.join(root, ".repo-graph/index.sqlite"));

  const report = await runDoctor(root);

  assert.equal(report.privacy.absolutePaths, 7);
  for (const expected of [
    /^file:\d+:path$/u,
    /^file:\d+:projectPath$/u,
    /^node:[a-f0-9]+:sourceFile$/u,
    /^node:[a-f0-9]+:projectPath$/u,
    /^edge:\d+:evidence$/u,
    /^edge:\d+:diagnostic$/u,
    /^diagnostic:\d+:file$/u,
  ]) {
    assert.equal(
      report.privacy.violations.some((value) => expected.test(value)),
      true,
      expected.source,
    );
  }
  assert.deepEqual(
    await readFile(path.join(root, ".repo-graph/index.sqlite")),
    before,
  );
});

test("doctor reports foreign-key violations from an otherwise rejected index", async (t) => {
  const root = await fixtureRepository(t);
  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
  const database = new DatabaseSync(path.join(root, ".repo-graph/index.sqlite"), {
    allowExtension: false,
  });
  try {
    database.exec("PRAGMA foreign_keys = OFF");
    const edge = database.prepare(
      "SELECT target_id FROM edges ORDER BY id LIMIT 1",
    ).get() as { target_id: string };
    database.prepare("DELETE FROM nodes WHERE id = ?").run(edge.target_id);
    database.prepare(
      "INSERT INTO diagnostics (code, level, message, file) VALUES (?, ?, ?, ?)",
    ).run("MISSING_FILE", "error", "missing file", "missing-diagnostic.ts");
    database.prepare(`
      UPDATE nodes
      SET source_file = 'missing-node.ts'
      WHERE id = (SELECT id FROM nodes ORDER BY id LIMIT 1)
    `).run();
    database.exec(`
      CREATE TABLE z_violation (node_id TEXT REFERENCES nodes(id));
      CREATE TABLE a_violation (node_id TEXT REFERENCES nodes(id));
      INSERT INTO z_violation VALUES ('missing-z');
      INSERT INTO a_violation VALUES ('missing-a');
    `);
  } finally {
    database.close();
  }

  const report = await runDoctor(root);

  assert.equal(report.state, "corrupt");
  assert.equal(report.foreignKeys.healthy, false);
  assert.equal(report.foreignKeys.violations.length > 0, true);
  assert.equal(
    report.foreignKeys.violations.some((violation) =>
      violation.table === "edges" && violation.parent === "nodes"
    ),
    true,
  );
  assert.deepEqual(
    report.foreignKeys.violations,
    [...report.foreignKeys.violations].sort((left, right) =>
      (left.table < right.table ? -1 : left.table > right.table ? 1 : 0) ||
      (left.rowid ?? -1) - (right.rowid ?? -1) ||
      (left.parent < right.parent ? -1 : left.parent > right.parent ? 1 : 0) ||
      left.fkid - right.fkid
    ),
  );
});

test("stats reports deterministic graph counts, confidence, packages, and bytes", async (t) => {
  const root = await fixtureRepository(t);
  const indexed = await buildFullIndex(root, { format: "json" });
  assert.equal(indexed.ok, true);

  const first = await getStats(root);
  const second = await getStats(root);

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    "repository",
    "state",
    "counts",
    "confidence",
    "topPackages",
    "databaseBytes",
  ]);
  assert.equal(first.state, "current");
  assert.ok(first.counts.projects >= 1);
  assert.equal(first.counts.files, indexed.ok ? indexed.value.files : -1);
  assert.ok(first.counts.nodes > 0);
  assert.ok(first.counts.edges > 0);
  assert.equal(
    first.confidence.resolved +
      first.confidence.syntactic +
      first.confidence.heuristic,
    first.counts.edges,
  );
  assert.deepEqual(first.topPackages.map(({ name }) => name), [
    "diagnostic-fixture",
  ]);
  assert.ok(first.databaseBytes > 0);
});

test("stats describes the persisted index after project sources become stale", async (t) => {
  const root = await fixtureRepository(t);
  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
  const indexed = await getStats(root);
  await mkdir(path.join(root, "other/src"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "changed-after-index", private: true }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, "other/tsconfig.json"),
      `${JSON.stringify({ include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, "other/src/index.ts"),
      "export const addedAfterIndex = true;\n",
    ),
  ]);

  const stale = await getStats(root);

  assert.equal(stale.state, "stale");
  assert.deepEqual(stale.counts, indexed.counts);
  assert.deepEqual(stale.confidence, indexed.confidence);
  assert.deepEqual(stale.topPackages, indexed.topPackages);
  assert.deepEqual(stale.topPackages.map(({ name }) => name), [
    "diagnostic-fixture",
  ]);
});

test("diagnostic CLI renders deterministic JSON and maps index states", async (t) => {
  const root = await fixtureRepository(t);

  const missing = await invoke(root, ["status", "--format", "json"]);
  assert.equal(missing.exitCode, ExitCode.MissingOrStaleIndex);
  assert.equal(missing.stderr, "");
  assert.equal(
    missing.stdout,
    `${JSON.stringify(JSON.parse(missing.stdout), null, 2)}\n`,
  );

  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);
  for (const command of ["status", "doctor", "stats"] as const) {
    const result = await invoke(root, [command, "--format", "json"]);
    assert.equal(result.exitCode, ExitCode.Ok);
    assert.equal(result.stderr, "");
    assert.equal(
      result.stdout,
      `${JSON.stringify(JSON.parse(result.stdout), null, 2)}\n`,
    );
  }

  await appendFile(path.join(root, "src/index.ts"), "export const stale = 1;\n");
  const stale = await invoke(root, ["status", "--format", "json"]);
  assert.equal(stale.exitCode, ExitCode.MissingOrStaleIndex);
  assert.equal((JSON.parse(stale.stdout) as { state: string }).state, "stale");

  await writeFile(path.join(root, ".repo-graph/index.sqlite"), "broken\n");
  const corrupt = await invoke(root, ["status", "--format", "json"]);
  assert.equal(corrupt.exitCode, ExitCode.InternalFailure);
  assert.equal((JSON.parse(corrupt.stdout) as { state: string }).state, "corrupt");
});

test("diagnostic CLI renders stable human-readable text", async (t) => {
  const root = await fixtureRepository(t);
  assert.equal((await buildFullIndex(root, { format: "json" })).ok, true);

  for (const command of ["status", "doctor", "stats"] as const) {
    const result = await invoke(root, [command, "--format", "text"]);
    assert.equal(result.exitCode, ExitCode.Ok);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /^Repository: /u);
    assert.match(result.stdout, /\nState: current\n/u);
    assert.doesNotMatch(
      result.stdout,
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u,
    );
  }
});

test("diagnostic commands retain global help behavior", async (t) => {
  const root = await fixtureRepository(t);

  const result = await invoke(root, ["status", "--help"]);

  assert.equal(result.exitCode, ExitCode.Ok);
  assert.match(result.stdout, /^Usage: repo-graph index/u);
  assert.equal(result.stderr, "");
});
