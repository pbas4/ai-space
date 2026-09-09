import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { ExitCode } from "../src/domain/diagnostic.js";
import type { GraphFragment, GraphNode } from "../src/domain/graph.js";
import type { LocalRepository } from "../src/local/path-policy.js";
import { normalizeGraph, type NormalizedGraph } from "../src/normalize/normalize.js";
import {
  GraphDatabase,
  type IndexMetadata,
} from "../src/storage/database.js";

function graphNode(
  id: string,
  kind: GraphNode["kind"],
  qualifiedName: string,
  sourceFile: string,
): GraphNode {
  return {
    id,
    kind,
    label: qualifiedName.split(".").at(-1) ?? qualifiedName,
    qualifiedName,
    sourceFile,
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 12,
    packageName: "@fixture/app",
    projectPath: "tsconfig.json",
    exported: kind === "class",
    signature: kind === "class" ? "typeof UserService" : "",
    summary: kind === "class" ? "Coordinates users." : "",
  };
}

function validGraph(): NormalizedGraph {
  const file = graphNode("file", "file", "src/user.ts", "src/user.ts");
  const service = graphNode("service", "class", "UserService", "src/user.ts");
  const fragments: GraphFragment[] = [
    {
      ownerFile: "src/user.ts",
      nodes: [file, service],
      edges: [
        {
          source: file.id,
          target: service.id,
          kind: "declares",
          confidence: "syntactic",
          evidence: {
            file: "src/user.ts",
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 12,
          },
        },
      ],
      diagnostics: [
        {
          code: "FIXTURE_WARNING",
          level: "warning",
          message: "Fixture warning.",
          file: "src/user.ts",
        },
      ],
    },
  ];
  const normalized = normalizeGraph(fragments);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) throw new Error("fixture normalization failed");
  return normalized.value;
}

async function fixtureRepository(): Promise<{
  directory: string;
  repo: LocalRepository;
}> {
  const directory = await mkdtemp(join(tmpdir(), "repo-graph-storage-"));
  return {
    directory,
    repo: { root: directory, dataDir: join(directory, ".repo-graph") },
  };
}

test("creates a hardened STRICT schema with FTS5 and read-only queries", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const graph = validGraph();
  const database = new GraphDatabase();

  const result = await database.createAtomic(repo, graph, {
    schemaVersion: 1,
    toolVersion: "0.1.0",
    compilerVersion: "6.0.3",
    contentHash: "content-sha256",
    configHash: "config-sha256",
    complete: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(await database.stats(), {
    fileCount: 1,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    diagnosticCount: graph.diagnostics.length,
  });
  assert.deepEqual(await database.foreignKeyViolations(), []);
  assert.equal((await database.nodes()).length, graph.nodes.length);
  assert.equal((await database.edges()).length, graph.edges.length);
  assert.deepEqual(await database.metadata(), {
    compilerVersion: "6.0.3",
    complete: true,
    configHash: "config-sha256",
    contentHash: "content-sha256",
    schemaVersion: 1,
    toolVersion: "0.1.0",
  });
  assert.equal((await database.searchNodes("UserService", 5))[0]?.qualifiedName, "UserService");

  const indexPath = join(repo.dataDir, "index.sqlite");
  const sqlite = new DatabaseSync(indexPath, {
    readOnly: true,
    allowExtension: false,
  });
  t.after(() => sqlite.close());
  const tables = sqlite.prepare(
    "SELECT name, strict FROM pragma_table_list ORDER BY name",
  ).all() as Array<{ name: string; strict: number }>;
  for (const name of ["metadata", "files", "nodes", "edges", "diagnostics"]) {
    assert.equal(tables.find((item) => item.name === name)?.strict, 1, name);
  }
  assert.ok(tables.some((item) => item.name === "node_search"));
  assert.equal(
    (sqlite.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number })
      .foreign_keys,
    1,
  );
  assert.throws(() => sqlite.prepare("SELECT load_extension('missing')").get());
  const serialized = await readFile(indexPath);
  assert.equal(serialized.includes(Buffer.from(directory)), false);
});

test("opens an existing repository-local index in a fresh database instance", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const graph = validGraph();
  const created = await new GraphDatabase().createAtomic(
    repo,
    graph,
    { schemaVersion: 1 },
  );
  assert.equal(created.ok, true);

  const database = new GraphDatabase();
  const opened = await database.openExisting(repo);

  assert.equal(opened.ok, true);
  assert.deepEqual(await database.stats(), {
    fileCount: 1,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    diagnosticCount: graph.diagnostics.length,
  });
});

test("reports a missing index without throwing or creating repository data", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));

  const result = await new GraphDatabase().openExisting(repo);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.exitCode, ExitCode.MissingOrStaleIndex);
    assert.equal(result.diagnostics[0]?.code, "MISSING_INDEX");
  }
  assert.deepEqual(await readdir(directory), []);
});

test("rejects an index with an incompatible schema version", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const created = await new GraphDatabase().createAtomic(
    repo,
    validGraph(),
    { schemaVersion: 1 },
  );
  assert.equal(created.ok, true);
  const sqlite = new DatabaseSync(join(repo.dataDir, "index.sqlite"), {
    allowExtension: false,
  });
  sqlite.prepare(
    "UPDATE metadata SET value = ? WHERE key = 'schemaVersion'",
  ).run("2");
  sqlite.exec("DROP TABLE node_search");
  sqlite.close();

  const result = await new GraphDatabase().openExisting(repo);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.exitCode, ExitCode.MissingOrStaleIndex);
    assert.equal(result.diagnostics[0]?.code, "INCOMPATIBLE_INDEX");
  }
});

test("rejects an unhealthy existing index instead of attaching it", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const created = await new GraphDatabase().createAtomic(
    repo,
    validGraph(),
    { schemaVersion: 1 },
  );
  assert.equal(created.ok, true);
  const sqlite = new DatabaseSync(join(repo.dataDir, "index.sqlite"), {
    allowExtension: false,
  });
  sqlite.exec("DROP TABLE node_search");
  sqlite.close();
  const database = new GraphDatabase();

  const result = await database.openExisting(repo);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.exitCode, ExitCode.MissingOrStaleIndex);
    assert.equal(result.diagnostics[0]?.code, "UNUSABLE_INDEX");
  }
  await assert.rejects(database.nodes());
});

test("rejects same-count search rows that do not map one-to-one to nodes", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const graph = validGraph();
  const created = await new GraphDatabase().createAtomic(
    repo,
    graph,
    { schemaVersion: 1 },
  );
  assert.equal(created.ok, true);
  const duplicate = graph.nodes[0]!;
  const sqlite = new DatabaseSync(join(repo.dataDir, "index.sqlite"), {
    allowExtension: false,
  });
  sqlite.exec("DELETE FROM node_search");
  const insert = sqlite.prepare(`
    INSERT INTO node_search (
      node_id, label, qualified_name, summary, source_file
    ) VALUES (?, ?, ?, ?, ?)
  `);
  for (let index = 0; index < graph.nodes.length; index += 1) {
    insert.run(
      duplicate.id,
      duplicate.label,
      duplicate.qualifiedName,
      duplicate.summary,
      duplicate.sourceFile,
    );
  }
  sqlite.close();

  const result = await new GraphDatabase().openExisting(repo);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.exitCode, ExitCode.MissingOrStaleIndex);
    assert.equal(result.diagnostics[0]?.code, "UNUSABLE_INDEX");
  }
});

test("does not open an index through a data-directory symlink outside the repository", async (t) => {
  const local = await fixtureRepository();
  const outside = await fixtureRepository();
  t.after(() => rm(local.directory, { recursive: true, force: true }));
  t.after(() => rm(outside.directory, { recursive: true, force: true }));
  const created = await new GraphDatabase().createAtomic(
    outside.repo,
    validGraph(),
    { schemaVersion: 1 },
  );
  assert.equal(created.ok, true);
  await symlink(outside.repo.dataDir, local.repo.dataDir, "dir");

  const result = await new GraphDatabase().openExisting(local.repo);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.exitCode, ExitCode.MissingOrStaleIndex);
    assert.equal(result.diagnostics[0]?.code, "INDEX_OUTSIDE_REPOSITORY");
  }
});

test("failed replacement preserves the previous valid database", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const graph = validGraph();
  const database = new GraphDatabase();
  const first = await database.createAtomic(repo, graph, { schemaVersion: 1 });
  assert.equal(first.ok, true);
  const previousBytes = await readFile(join(repo.dataDir, "index.sqlite"));
  const invalidGraph: NormalizedGraph = {
    ...graph,
    edges: [
      {
        ...graph.edges[0]!,
        target: "missing-node",
      },
    ],
  };

  const failed = await database.createAtomic(repo, invalidGraph, {
    schemaVersion: 2,
  });

  assert.equal(failed.ok, false);
  assert.deepEqual(
    await readFile(join(repo.dataDir, "index.sqlite")),
    previousBytes,
  );
  assert.equal((await database.stats()).nodeCount, graph.nodes.length);
  assert.deepEqual(
    (await readdir(repo.dataDir)).filter((name) => name.includes(".tmp-")),
    [],
  );
});

test("storage rejects source bodies and unsafe metadata without creating an index", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = new GraphDatabase();
  const withBody = validGraph();
  Object.assign(withBody.nodes[0] ?? {}, { sourceBody: "private source" });
  const withUnknownNodeField = validGraph();
  Object.assign(withUnknownNodeField.nodes[0] ?? {}, { extensionData: "private" });
  const absolute = validGraph();
  Object.assign(absolute.nodes[0] ?? {}, { sourceFile: join(directory, "source.ts") });

  for (const graph of [withBody, withUnknownNodeField, absolute]) {
    const result = await database.createAtomic(repo, graph, { schemaVersion: 1 });
    assert.equal(result.ok, false);
  }
  for (const metadata of [
    { schemaVersion: 1, rawSource: "private source" },
    { schemaVersion: 1, unexpected: "scalar values are not implicitly safe" },
    { schemaVersion: 1, complete: "yes" },
    { schemaVersion: "1" },
  ]) {
    const metadataResult = await database.createAtomic(
      repo,
      validGraph(),
      metadata as unknown as IndexMetadata,
    );
    assert.equal(metadataResult.ok, false);
  }
  await assert.rejects(readFile(join(repo.dataDir, "index.sqlite")));
});

test("storage rejects Windows drive-relative paths in every persisted path slot", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cases: Array<(graph: NormalizedGraph) => void> = [
    (graph) => {
      graph.nodes[0]!.sourceFile = "C:relative.ts";
    },
    (graph) => {
      graph.nodes[0]!.projectPath = "C:relative.ts";
    },
    (graph) => {
      graph.edges[0]!.evidence.file = "C:relative.ts";
    },
    (graph) => {
      graph.diagnostics[0]!.file = "C:relative.ts";
    },
    (graph) => {
      graph.edges[0]!.diagnostic = {
        code: "UNSAFE_EDGE_PATH",
        level: "warning",
        message: "Unsafe edge path fixture.",
        file: "C:relative.ts",
      };
    },
  ];

  for (const mutate of cases) {
    const graph = validGraph();
    mutate(graph);
    const result = await new GraphDatabase().createAtomic(
      repo,
      graph,
      { schemaVersion: 1 },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.diagnostics.some((item) =>
        item.code === "INVALID_SOURCE_PATH"
      ));
    }
  }
  await assert.rejects(readFile(join(repo.dataDir, "index.sqlite")));
});

test("storage snapshots validated inputs before asynchronous filesystem work", async (t) => {
  const { directory, repo } = await fixtureRepository();
  const outside = await mkdtemp(join(tmpdir(), "repo-graph-storage-mutated-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const graph = validGraph();
  const metadata: IndexMetadata & Record<string, unknown> = { schemaVersion: 1 };
  const database = new GraphDatabase();
  const originalDataDir = repo.dataDir;

  const pending = database.createAtomic(repo, graph, metadata);
  graph.nodes[0]!.sourceFile = "C:relative.ts";
  metadata.rawSource = "PRIVATE SOURCE";
  repo.root = outside;
  repo.dataDir = join(outside, ".repo-graph");
  const result = await pending;

  assert.equal(result.ok, true);
  assert.ok((await database.nodes()).every((item) =>
    item.sourceFile === "src/user.ts"
  ));
  assert.deepEqual(await database.metadata(), { schemaVersion: 1 });
  const serialized = await readFile(join(originalDataDir, "index.sqlite"));
  assert.equal(serialized.includes(Buffer.from("C:relative.ts")), false);
  assert.equal(serialized.includes(Buffer.from("PRIVATE SOURCE")), false);
  assert.deepEqual(await readdir(outside), []);
});

test("storage redacts absolute paths embedded in diagnostic messages", async (t) => {
  const { directory, repo } = await fixtureRepository();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const graph = validGraph();
  graph.diagnostics[0]!.message =
    `Cannot read '${join(directory, "private/config.json")}'.`;
  graph.edges[0]!.diagnostic = {
    code: "EDGE_WARNING",
    level: "warning",
    message: "Cannot read C:\\Users\\secret\\tsconfig.json.",
  };

  const result = await new GraphDatabase().createAtomic(
    repo,
    graph,
    { schemaVersion: 1 },
  );

  assert.equal(result.ok, true);
  const sqlite = new DatabaseSync(join(repo.dataDir, "index.sqlite"), {
    readOnly: true,
    allowExtension: false,
  });
  t.after(() => sqlite.close());
  const messages = [
    ...(sqlite.prepare("SELECT message FROM diagnostics").all() as Array<{ message: string }>),
    ...(sqlite.prepare(
      "SELECT diagnostic_message AS message FROM edges WHERE diagnostic_message IS NOT NULL",
    ).all() as Array<{ message: string }>),
  ].map(({ message }) => message);
  assert.ok(messages.every((message) => message.includes("[absolute path]")));
  assert.ok(messages.every((message) => !message.includes(directory)));
  assert.ok(messages.every((message) => !/[A-Za-z]:[\\/]/u.test(message)));
});

test("rejects a data-directory symlink that would escape the repository", async (t) => {
  const { directory, repo } = await fixtureRepository();
  const outside = await mkdtemp(join(tmpdir(), "repo-graph-storage-outside-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, repo.dataDir, "dir");

  const result = await new GraphDatabase().createAtomic(
    repo,
    validGraph(),
    { schemaVersion: 1 },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(await readdir(outside), []);
});
