import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseCliArgs } from "../src/cli/args.js";
import { main } from "../src/cli/main.js";
import type {
  Confidence,
  EdgeKind,
  GraphEdge,
  GraphNode,
  NodeKind,
} from "../src/domain/graph.js";
import { ExitCode } from "../src/domain/diagnostic.js";
import type { LocalRepository } from "../src/local/path-policy.js";
import { analyzeImpact, renderImpactReport } from "../src/query/impact.js";
import { estimateTokens } from "../src/query/render.js";
import { GraphDatabase } from "../src/storage/database.js";

function node(
  id: string,
  kind: NodeKind,
  qualifiedName: string,
  sourceFile: string,
  packageName = "@fixture/auth",
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
    packageName,
    projectPath: "tsconfig.json",
    exported: true,
    signature: "",
    summary: "",
  };
}

function edge(
  source: string,
  target: string,
  kind: EdgeKind,
  confidence: Confidence,
  line: number,
): GraphEdge {
  return {
    source,
    target,
    kind,
    confidence,
    evidence: {
      file: "src/impact-fixture.ts",
      startLine: line,
      startColumn: 1,
      endLine: line,
      endColumn: 20,
    },
  };
}

function fixtureDatabase(nodes: GraphNode[], edges: GraphEdge[]): GraphDatabase {
  const database = new GraphDatabase();
  database.nodes = async () => nodes;
  database.edges = async () => edges;
  database.searchNodes = async (selector, limit) => nodes
    .filter((item) => [item.id, item.label, item.qualifiedName, item.sourceFile]
      .some((value) => value.toLowerCase().includes(selector.toLowerCase())))
    .slice(0, limit);
  return database;
}

function impactFixture(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return {
    nodes: [
      node("save", "method", "TokenStore.save", "packages/token/src/store.ts", "@fixture/token"),
      node("login", "method", "AuthService.login", "packages/auth/src/auth.ts"),
      node("route", "function", "LoginRoute.post", "packages/api/src/login.ts", "@fixture/api"),
      node("test", "test", "AuthService login", "packages/auth/src/auth.test.ts"),
      node("runtime", "function", "RuntimePlugin.activate", "packages/plugin/src/runtime.ts", "@fixture/plugin"),
    ],
    edges: [
      edge("login", "save", "calls", "resolved", 5),
      edge("route", "login", "references", "resolved", 9),
      edge("test", "login", "tests", "resolved", 12),
      edge("runtime", "save", "calls", "heuristic", 15),
    ],
  };
}

async function persistFixture(
  directory: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<LocalRepository> {
  const repository = { root: directory, dataDir: join(directory, ".repo-graph") };
  const stored = await new GraphDatabase().createAtomic(
    repository,
    { nodes, edges, diagnostics: [] },
    { schemaVersion: 1 },
  );
  assert.equal(stored.ok, true);
  return repository;
}

test("impact separates confirmed dependants from uncertain runtime behavior", async () => {
  const fixture = impactFixture();
  const database = fixtureDatabase(fixture.nodes, fixture.edges);

  const result = await analyzeImpact(database, "TokenStore.save", {
    depth: 3,
    tokenBudget: 2_000,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.value.direct.some((item) => item.qualifiedName === "AuthService.login"));
    assert.ok(result.value.transitive.some((item) => item.qualifiedName === "LoginRoute.post"));
    assert.ok(result.value.tests.some((item) => item.sourceFile.endsWith("auth.test.ts")));
    assert.ok(result.value.packages.some((item) => item.packageName === "@fixture/api"));
    assert.ok(result.value.uncertain.some((item) => item.qualifiedName === "RuntimePlugin.activate"));
    assert.ok(result.value.uncertain.every((item) => item.confidence !== "resolved"));
    assert.ok(result.value.direct.every((item) => item.hops.length === 1));
    assert.ok([
      ...result.value.direct,
      ...result.value.transitive,
      ...result.value.tests,
      ...result.value.uncertain,
    ].every((item) => item.hops.length === item.depth));
  }
});

test("impact traverses every approved reverse relation kind", async () => {
  const relationKinds = [
    "imports",
    "instantiates",
    "extends",
    "implements",
    "overrides",
  ] as const satisfies readonly EdgeKind[];
  const target = node("target", "class", "Target", "packages/target/src/target.ts");
  const dependants = relationKinds.map((kind) =>
    node(kind, "class", `Dependant.${kind}`, `packages/${kind}/src/index.ts`)
  );
  const database = fixtureDatabase(
    [target, ...dependants],
    relationKinds.map((kind, index) =>
      edge(kind, "target", kind, "resolved", index + 1)
    ),
  );

  const result = await analyzeImpact(database, "Target", {
    depth: 1,
    tokenBudget: 10_000,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(
      result.value.direct.map((item) => item.hops[0]?.kind).sort(),
      [...relationKinds].sort(),
    );
  }
});

test("impact marks depth truncation when a deeper path can improve confidence", async () => {
  const database = fixtureDatabase(
    [
      node("target", "method", "Target.save", "packages/target/src/target.ts"),
      node("uncertain", "method", "Caller.run", "packages/app/src/caller.ts"),
      node("bridge", "method", "Bridge.forward", "packages/app/src/bridge.ts"),
    ],
    [
      edge("uncertain", "target", "calls", "heuristic", 1),
      edge("bridge", "target", "calls", "resolved", 2),
      edge("uncertain", "bridge", "calls", "resolved", 3),
    ],
  );

  const result = await analyzeImpact(database, "Target.save", {
    depth: 1,
    tokenBudget: 10_000,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.value.uncertain.some((item) => item.id === "uncertain"));
    assert.equal(result.value.truncated, true);
  }
});

test("impact groups package summaries independently at each depth", async () => {
  const fixture = impactFixture();
  fixture.nodes.find((item) => item.id === "route")!.packageName = "@fixture/auth";
  const database = fixtureDatabase(fixture.nodes, fixture.edges);

  const result = await analyzeImpact(database, "save", {
    depth: 3,
    tokenBudget: 10_000,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const authPackages = result.value.packages.filter(
      (item) => item.packageName === "@fixture/auth",
    );
    assert.deepEqual(authPackages.map((item) => item.depth), [1, 2]);
    assert.ok(authPackages.every((item) => item.hops.length === item.depth));
    assert.deepEqual(
      authPackages.map((item) => item.impactedNodeIds),
      [["login"], ["route", "test"]],
    );
  }
});

test("impact keeps the best-confidence shortest explanation per dependant", async () => {
  const fixture = impactFixture();
  fixture.edges.push(
    edge("route", "save", "calls", "heuristic", 20),
    edge("route", "login", "references", "resolved", 21),
  );
  const database = fixtureDatabase(fixture.nodes, fixture.edges);

  const result = await analyzeImpact(database, "save", {
    depth: 3,
    tokenBudget: 2_000,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const route = result.value.transitive.find((item) => item.id === "route");
    assert.equal(route?.confidence, "resolved");
    assert.equal(route?.hops.length, 2);
    assert.equal(result.value.uncertain.some((item) => item.id === "route"), false);
    assert.equal(result.value.direct.some((item) => item.confidence !== "resolved"), false);
    assert.equal(result.value.transitive.some((item) => item.confidence !== "resolved"), false);
    assert.equal(result.value.tests.some((item) => item.confidence !== "resolved"), false);
  }
});

test("impact applies depth and token limits without changing classifications", async () => {
  const fixture = impactFixture();
  const database = fixtureDatabase(fixture.nodes, fixture.edges);

  const depthLimited = await analyzeImpact(database, "save", {
    depth: 1,
    tokenBudget: 2_000,
  });
  const budgetLimited = await analyzeImpact(database, "save", {
    depth: 3,
    tokenBudget: 1,
  });

  assert.equal(depthLimited.ok, true);
  if (depthLimited.ok) {
    assert.deepEqual(depthLimited.value.transitive, []);
    assert.ok(depthLimited.value.direct.every((item) => item.depth === 1));
    assert.equal(depthLimited.value.truncated, true);
  }
  assert.equal(budgetLimited.ok, true);
  if (budgetLimited.ok) {
    assert.equal(budgetLimited.value.truncated, true);
    assert.deepEqual(budgetLimited.value.direct, []);
    assert.deepEqual(budgetLimited.value.transitive, []);
    assert.deepEqual(budgetLimited.value.packages, []);
    assert.deepEqual(budgetLimited.value.tests, []);
    assert.deepEqual(budgetLimited.value.uncertain, []);
  }
});

test("impact command parses depth and renders budgeted JSON", async (t) => {
  assert.deepEqual(
    parseCliArgs(["impact", "TokenStore.save", "--depth", "4", "--budget", "900", "--format", "json"]),
    {
      ok: true,
      value: {
        command: "impact",
        selector: "TokenStore.save",
        depth: 4,
        budget: 900,
        format: "json",
      },
      diagnostics: [],
    },
  );
  assert.equal(parseCliArgs(["impact", "save", "--depth", "0"]).ok, false);
  assert.equal(parseCliArgs(["path", "a", "b", "--depth", "2"]).ok, false);

  const directory = await mkdtemp(join(tmpdir(), "repo-graph-impact-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = impactFixture();
  await persistFixture(directory, fixture.nodes, fixture.edges);
  let stdout = "";
  let stderr = "";

  const exitCode = await main(
    ["impact", "TokenStore.save", "--depth", "3", "--budget", "900", "--format", "json"],
    {
      cwd: directory,
      stdout: (value) => { stdout += value; },
      stderr: (value) => { stderr += value; },
    },
  );

  assert.equal(exitCode, ExitCode.Ok);
  assert.equal(stderr, "");
  const output = JSON.parse(stdout) as {
    direct: Array<{ qualifiedName: string; hops: unknown[] }>;
  };
  assert.ok(output.direct.some((item) => item.qualifiedName === "AuthService.login"));
  assert.ok(output.direct.every((item) => item.hops.length === 1));
  assert.ok(estimateTokens(stdout) <= 900);
});

test("text impact output sanitizes repository-derived control characters", async () => {
  const target = node("target", "method", "Unsafe\tTarget\u001b", "src/target.ts");
  const dependant = node(
    "dependant",
    "method",
    "Unsafe\u0085Dependant",
    "src/dependant.ts",
    "@fixture/unsafe\u001b",
  );
  const result = await analyzeImpact(
    fixtureDatabase(
      [target, dependant],
      [edge("dependant", "target", "calls", "resolved", 1)],
    ),
    "target",
    { depth: 1, tokenBudget: 2_000 },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const output = renderImpactReport(result.value, "text", 2_000);

  assert.doesNotMatch(output, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u);
});
