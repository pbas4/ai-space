import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  Confidence,
  EdgeKind,
  GraphEdge,
  GraphFragment,
  GraphNode,
  NodeKind,
} from "../src/domain/graph.js";
import type { LocalRepository } from "../src/local/path-policy.js";
import { normalizeGraph } from "../src/normalize/normalize.js";
import {
  classifyIntent,
  queryGraph,
  searchSeeds,
} from "../src/query/search.js";
import { traverse } from "../src/query/traverse.js";
import { GraphDatabase } from "../src/storage/database.js";

function node(
  id: string,
  kind: NodeKind,
  qualifiedName: string,
  sourceFile: string,
  options: Partial<GraphNode> = {},
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
    endColumn: 20,
    packageName: "@fixture/auth",
    projectPath: "packages/auth/tsconfig.json",
    exported: false,
    signature: "",
    summary: "",
    ...options,
  };
}

function edge(
  source: string,
  target: string,
  kind: EdgeKind,
  confidence: Confidence,
  line: number,
  file = "packages/auth/src/user-service.ts",
): GraphEdge {
  return {
    source,
    target,
    kind,
    confidence,
    evidence: {
      file,
      startLine: line,
      startColumn: 1,
      endLine: line,
      endColumn: 20,
    },
  };
}

function fixtureFragments(): GraphFragment[] {
  const packageNode = node(
    "package",
    "package",
    "@fixture/auth",
    "packages/auth/package.json",
    { exported: true },
  );
  const fileNode = node(
    "file",
    "file",
    "packages/auth/src/user-service.ts",
    "packages/auth/src/user-service.ts",
  );
  const service = node(
    "service",
    "class",
    "UserService",
    "packages/auth/src/user-service.ts",
    {
      exported: true,
      signature: "class UserService",
      summary: "Authenticates users.",
    },
  );
  const authenticate = node(
    "authenticate",
    "method",
    "UserService.authenticate",
    "packages/auth/src/user-service.ts",
    { startLine: 8, endLine: 10, signature: "authenticate(): Token" },
  );
  const tokenStore = node(
    "token-store",
    "class",
    "TokenStore",
    "packages/auth/src/token-store.ts",
    { exported: true, summary: "Stores authentication tokens." },
  );
  const testNode = node(
    "test",
    "test",
    "UserService authentication",
    "packages/auth/src/user-service.test.ts",
    { projectPath: "packages/auth/tsconfig.test.json" },
  );
  const similar = node(
    "factory",
    "class",
    "UserServiceFactory",
    "packages/factory/src/user-service-factory.ts",
    {
      packageName: "@fixture/factory",
      projectPath: "packages/factory/tsconfig.json",
      exported: true,
    },
  );

  return [
    {
      ownerFile: "packages/auth/src/user-service.ts",
      nodes: [packageNode, fileNode, service, authenticate],
      edges: [
        edge("package", "file", "contains", "syntactic", 1, "packages/auth/package.json"),
        edge("file", "service", "declares", "syntactic", 3),
        edge("service", "authenticate", "contains", "resolved", 8),
        edge("authenticate", "token-store", "calls", "resolved", 9),
        edge("file", "token-store", "configured_by", "syntactic", 1),
      ],
      diagnostics: [],
    },
    {
      ownerFile: "packages/auth/src/token-store.ts",
      nodes: [tokenStore],
      edges: [],
      diagnostics: [],
    },
    {
      ownerFile: "packages/auth/src/user-service.test.ts",
      nodes: [testNode],
      edges: [
        edge(
          "test",
          "authenticate",
          "tests",
          "heuristic",
          5,
          "packages/auth/src/user-service.test.ts",
        ),
      ],
      diagnostics: [],
    },
    {
      ownerFile: "packages/factory/src/user-service-factory.ts",
      nodes: [similar],
      edges: [],
      diagnostics: [],
    },
  ];
}

async function fixtureDatabase(
  fragments = fixtureFragments(),
): Promise<{ directory: string; database: GraphDatabase }> {
  const directory = await mkdtemp(join(tmpdir(), "repo-graph-query-"));
  const repo: LocalRepository = {
    root: directory,
    dataDir: join(directory, ".repo-graph"),
  };
  const normalized = normalizeGraph(fragments);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) throw new Error("fixture normalization failed");
  const database = new GraphDatabase();
  const stored = await database.createAtomic(repo, normalized.value, {
    schemaVersion: 1,
  });
  assert.equal(stored.ok, true);
  return { directory, database };
}

test("architecture query ranks the exact exported symbol and traverses its package", async (t) => {
  const { directory, database } = await fixtureDatabase();
  t.after(() => rm(directory, { recursive: true, force: true }));

  const result = await queryGraph(
    database,
    "how does UserService authentication work",
    { tokenBudget: 1_500 },
  );

  assert.equal(result.intent, "architecture");
  assert.equal(result.seeds[0]?.qualifiedName, "UserService");
  assert.ok(result.nodes.some((item) => item.qualifiedName === "UserService.authenticate"));
  assert.ok(result.nodes.some((item) => item.qualifiedName === "@fixture/auth"));
});

test("seed ranking normalizes identifiers and paths, prefers exact exported matches, and diversifies files", async (t) => {
  const { directory, database } = await fixtureDatabase();
  t.after(() => rm(directory, { recursive: true, force: true }));

  const identifierHits = await searchSeeds(database, "user-service authentication", 3);
  const pathHits = await searchSeeds(database, "packages\\auth\\src\\token-store.ts", 2);

  assert.equal(identifierHits[0]?.qualifiedName, "UserService");
  assert.equal(identifierHits[0]?.exact, true);
  assert.equal(new Set(identifierHits.map((item) => item.sourceFile)).size, identifierHits.length);
  assert.equal(pathHits[0]?.qualifiedName, "TokenStore");
});

test("intent classification uses a fixed deterministic vocabulary", () => {
  assert.equal(classifyIntent("what breaks if TokenStore changes"), "impact");
  assert.equal(classifyIntent("which tests cover authentication"), "test");
  assert.equal(classifyIntent("show the call flow from authenticate"), "call");
  assert.equal(classifyIntent("what imports TokenStore"), "dependency");
  assert.equal(classifyIntent("find a path between A and B"), "path");
  assert.equal(classifyIntent("how is authentication structured"), "architecture");
});

test("traversal applies intent edge allowlists and preserves confidence and evidence", async (t) => {
  const { directory, database } = await fixtureDatabase();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const seeds = await searchSeeds(database, "UserService", 1);

  const architecture = await traverse(database, seeds, {
    intent: "architecture",
    maxDepth: 3,
    maxNodes: 20,
  });
  const callFlow = await traverse(database, seeds, {
    intent: "call",
    maxDepth: 3,
    maxNodes: 20,
  });

  assert.ok(architecture.edges.some((item) => item.kind === "contains"));
  assert.ok(!architecture.edges.some((item) => item.kind === "calls"));
  assert.ok(!architecture.edges.some((item) => item.kind === "tests"));
  assert.ok(callFlow.edges.some((item) => item.kind === "calls"));
  assert.ok(!callFlow.edges.some((item) => item.kind === "configured_by"));
  assert.ok(callFlow.edges.every((item) => item.confidence && item.evidence.file));
});

test("traversal enforces maxNodes during expansion and retains connecting predecessors", async () => {
  const seedNode = node("seed", "function", "seed", "src/seed.ts");
  const predecessor = node(
    "predecessor",
    "function",
    "predecessor",
    "src/predecessor.ts",
  );
  const remote = node("remote", "function", "remoteTarget", "src/remote.ts", {
    exported: true,
  });
  let remoteRankingReads = 0;
  for (const key of ["label", "qualifiedName", "sourceFile"] as const) {
    const value = remote[key];
    Object.defineProperty(remote, key, {
      enumerable: true,
      get() {
        remoteRankingReads += 1;
        return value;
      },
    });
  }
  const database = new GraphDatabase();
  database.nodes = async () => [seedNode, predecessor, remote];
  database.edges = async () => [
    edge("seed", "predecessor", "calls", "resolved", 1),
    edge("predecessor", "remote", "calls", "resolved", 2),
  ];
  const seed = {
    ...seedNode,
    exact: true,
    lexicalScore: 1_000,
    matchedTerms: ["seed"],
  };

  const result = await traverse(database, [seed], {
    intent: "call",
    maxDepth: 10,
    maxNodes: 2,
    queryTerms: ["remoteTarget"],
  });

  assert.deepEqual(new Set(result.nodes.map((item) => item.id)), new Set([
    "seed",
    "predecessor",
  ]));
  assert.deepEqual(
    result.edges.map((item) => [item.source, item.target]),
    [["seed", "predecessor"]],
  );
  assert.equal(remoteRankingReads, 0);
});

test("bounded traversal prefers the higher-ranked equal-confidence neighbor", async () => {
  const seedNode = node("seed", "function", "seed", "src/seed.ts");
  const lowerRanked = node(
    "a-lower-ranked",
    "function",
    "incidental",
    "src/incidental.ts",
  );
  const higherRanked = node(
    "z-higher-ranked",
    "function",
    "requestedTarget",
    "src/requested.ts",
    { exported: true },
  );
  const database = new GraphDatabase();
  database.nodes = async () => [seedNode, lowerRanked, higherRanked];
  database.edges = async () => [
    edge("seed", "a-lower-ranked", "calls", "resolved", 1),
    edge("seed", "z-higher-ranked", "calls", "resolved", 2),
  ];

  const result = await traverse(database, [{
    ...seedNode,
    exact: true,
    lexicalScore: 1_000,
    matchedTerms: ["seed"],
  }], {
    intent: "call",
    maxDepth: 1,
    maxNodes: 2,
    queryTerms: ["requestedTarget"],
  });

  assert.deepEqual(new Set(result.nodes.map((item) => item.id)), new Set([
    "seed",
    "z-higher-ranked",
  ]));
});

test("bounded traversal relaxes confidence for an admitted node after reaching maxNodes", async () => {
  const heuristicSeed = node(
    "heuristic-seed",
    "function",
    "heuristicSeed",
    "src/heuristic-seed.ts",
  );
  const resolvedSeed = node(
    "resolved-seed",
    "function",
    "resolvedSeed",
    "src/resolved-seed.ts",
  );
  const shared = node("shared", "function", "shared", "src/shared.ts");
  const database = new GraphDatabase();
  database.nodes = async () => [heuristicSeed, resolvedSeed, shared];
  database.edges = async () => [
    edge("heuristic-seed", "shared", "calls", "heuristic", 1),
    edge("resolved-seed", "shared", "calls", "resolved", 2),
  ];

  const result = await traverse(database, [
    {
      ...heuristicSeed,
      exact: true,
      lexicalScore: 0,
      matchedTerms: [],
    },
    {
      ...resolvedSeed,
      exact: true,
      lexicalScore: 0,
      matchedTerms: [],
    },
  ], {
    intent: "call",
    maxDepth: 1,
    maxNodes: 3,
    queryTerms: ["unmatched"],
  });

  assert.deepEqual(result.nodes.map((item) => item.id), [
    "heuristic-seed",
    "resolved-seed",
    "shared",
  ]);
  assert.equal(result.nodes.find((item) => item.id === "shared")?.rankScore, 32_152);
});

test("query order is stable across fragment insertion orders and repeated runs", async (t) => {
  const forward = await fixtureDatabase();
  const reversed = await fixtureDatabase(fixtureFragments().reverse());
  t.after(() => rm(forward.directory, { recursive: true, force: true }));
  t.after(() => rm(reversed.directory, { recursive: true, force: true }));

  const snapshots: string[] = [];
  for (const database of [forward.database, forward.database, reversed.database]) {
    const result = await queryGraph(database, "UserService authentication", {
      tokenBudget: 1_500,
      format: "json",
    });
    snapshots.push(JSON.stringify({
      seeds: result.seeds.map((item) => item.id),
      nodes: result.nodes.map((item) => item.id),
      edges: result.edges.map((item) => [item.source, item.kind, item.target]),
      output: result.output,
    }));
  }

  assert.equal(new Set(snapshots).size, 1);
});

test("text query output sanitizes repository-derived control characters", async () => {
  const unsafe = node(
    "unsafe",
    "class",
    "Unsafe\tName\u001b\u0085",
    "src/unsafe.ts",
  );
  const database = new GraphDatabase();
  database.nodes = async () => [unsafe];
  database.edges = async () => [];
  database.searchNodes = async () => [unsafe];

  const result = await queryGraph(database, "Unsafe", {
    format: "text",
    tokenBudget: 1_500,
  });

  assert.doesNotMatch(result.output, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u);
});
