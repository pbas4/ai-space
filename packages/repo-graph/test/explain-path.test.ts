import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  Confidence,
  EdgeKind,
  GraphEdge,
  GraphNode,
  NodeKind,
} from "../src/domain/graph.js";
import { parseCliArgs } from "../src/cli/args.js";
import { main } from "../src/cli/main.js";
import { ExitCode } from "../src/domain/diagnostic.js";
import type { LocalRepository } from "../src/local/path-policy.js";
import { explainNode, resolveSelector } from "../src/query/explain.js";
import { renderExplainedPath, shortestPath } from "../src/query/path.js";
import { estimateTokens } from "../src/query/render.js";
import { GraphDatabase } from "../src/storage/database.js";

function node(
  id: string,
  kind: NodeKind,
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
    endColumn: 20,
    packageName: "@fixture/app",
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
      file: "src/graph.ts",
      startLine: line,
      startColumn: 1,
      endLine: line,
      endColumn: 20,
    },
  };
}

function fixtureDatabase(nodes: GraphNode[], edges: GraphEdge[] = []): GraphDatabase {
  const database = new GraphDatabase();
  database.nodes = async () => nodes;
  database.edges = async () => edges;
  database.searchNodes = async (selector, limit) => nodes
    .filter((item) => [
      item.label,
      item.qualifiedName,
      item.sourceFile,
    ].some((value) => value.toLowerCase().includes(selector.toLowerCase())))
    .slice(0, limit);
  return database;
}

async function persistFixture(
  directory: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<LocalRepository> {
  const repo = { root: directory, dataDir: join(directory, ".repo-graph") };
  const graph = {
    nodes: [...nodes].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    edges: [...edges].sort((left, right) => {
      const leftKey = `${left.source}\0${left.target}\0${left.kind}`;
      const rightKey = `${right.source}\0${right.target}\0${right.kind}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
    diagnostics: [],
  };
  const stored = await new GraphDatabase().createAtomic(
    repo,
    graph,
    { schemaVersion: 1 },
  );
  assert.equal(stored.ok, true);
  return repo;
}

test("parses explain and path commands with format and token budgets", () => {
  assert.deepEqual(
    parseCliArgs(["explain", "src/client.ts", "--budget", "900", "--format", "json"]),
    {
      ok: true,
      value: {
        command: "explain",
        selector: "src/client.ts",
        budget: 900,
        format: "json",
      },
      diagnostics: [],
    },
  );
  assert.deepEqual(parseCliArgs(["path", "LoginPage", "TokenStore"]), {
    ok: true,
    value: {
      command: "path",
      from: "LoginPage",
      to: "TokenStore",
      budget: 1_500,
      format: "text",
    },
    diagnostics: [],
  });
  assert.equal(parseCliArgs(["explain", "Client", "--budget", "0"]).ok, false);
  assert.equal(parseCliArgs(["path", "only-one-selector"]).ok, false);
});

test("fresh-process query commands report a missing index without throwing or writing", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "repo-graph-query-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let stdout = "";
  let stderr = "";

  const exitCode = await main(["explain", "Client"], {
    cwd: directory,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });

  assert.equal(exitCode, ExitCode.MissingOrStaleIndex);
  assert.equal(stdout, "");
  assert.match(stderr, /MISSING_INDEX.*repo-graph index/iu);
  assert.deepEqual(await readdir(directory), []);
});

test("path CLI opens the existing index and emits stable JSON from a fresh process", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "repo-graph-path-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await persistFixture(
    directory,
    [
      node("auth", "function", "authenticate", "src/auth.ts"),
      node("login", "class", "LoginPage", "src/login.ts"),
      node("token", "class", "TokenStore", "src/token.ts"),
    ],
    [
      edge("login", "auth", "calls", "resolved", 4),
      edge("auth", "token", "references", "resolved", 9),
    ],
  );
  let stdout = "";
  let stderr = "";

  const exitCode = await main(
    ["path", "LoginPage", "TokenStore", "--format", "json", "--budget", "1500"],
    {
      cwd: directory,
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
    },
  );

  assert.equal(exitCode, ExitCode.Ok);
  assert.equal(stderr, "");
  const output = JSON.parse(stdout) as {
    hops: Array<{ kind: string; confidence: string; evidence: { file: string } }>;
  };
  assert.equal(output.hops.length, 2);
  assert.ok(output.hops.every((hop) =>
    hop.kind && hop.confidence && hop.evidence.file
  ));
});

test("explain CLI opens the existing index and renders the resolved seed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "repo-graph-explain-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await persistFixture(
    directory,
    [node("login", "class", "LoginPage", "src/login.ts")],
    [],
  );
  let stdout = "";

  const exitCode = await main(
    ["explain", "LoginPage", "--format", "json", "--budget", "1500"],
    {
      cwd: directory,
      stdout: (value) => {
        stdout += value;
      },
      stderr: () => undefined,
    },
  );

  assert.equal(exitCode, ExitCode.Ok);
  const output = JSON.parse(stdout) as {
    intent: string;
    seeds: Array<{ id: string; name: string }>;
  };
  assert.equal(output.intent, "architecture");
  assert.deepEqual(output.seeds, [{
    id: "login",
    kind: "class",
    name: "LoginPage",
    path: "src/login.ts",
    line: 1,
  }]);
});

test("explain reports ambiguous symbols with actionable candidates", async () => {
  const database = fixtureDatabase([
    node("client-a", "function", "alpha.createClient", "src/alpha.ts"),
    node("client-b", "function", "beta.createClient", "src/beta.ts"),
  ]);

  const result = await explainNode(database, "createClient", 1_500);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostics[0]?.code, "AMBIGUOUS_SELECTOR");
    assert.match(result.diagnostics[0]?.message ?? "", /client-a.*src\/alpha\.ts/iu);
    assert.match(result.diagnostics[0]?.message ?? "", /client-b.*src\/beta\.ts/iu);
  }
});

test("selector resolution prefers exact IDs and repository-relative file nodes", async () => {
  const database = fixtureDatabase([
    node("client-a", "function", "alpha.createClient", "src/client.ts"),
    node("client-b", "function", "beta.createClient", "src/client.ts"),
    node("client-file", "file", "src/client.ts", "src/client.ts"),
  ]);

  const byId = await resolveSelector(database, "client-a");
  const byPath = await resolveSelector(database, "./src\\client.ts");

  assert.equal(byId.ok, true);
  if (byId.ok) {
    assert.equal(byId.value.node.id, "client-a");
    assert.equal(byId.value.matchedBy, "id");
  }
  assert.equal(byPath.ok, true);
  if (byPath.ok) {
    assert.equal(byPath.value.node.id, "client-file");
    assert.equal(byPath.value.matchedBy, "path");
  }
});

test("path returns every hop with relation, confidence, and evidence", async () => {
  const database = fixtureDatabase(
    [
      node("login", "class", "LoginPage", "src/login.ts"),
      node("auth", "function", "authenticate", "src/auth.ts"),
      node("token", "class", "TokenStore", "src/token.ts"),
    ],
    [
      edge("login", "auth", "calls", "resolved", 4),
      edge("auth", "token", "references", "resolved", 9),
    ],
  );

  const result = await shortestPath(
    database,
    "LoginPage",
    "TokenStore",
    1_500,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.nodes.map((item) => item.id), [
      "login",
      "auth",
      "token",
    ]);
    assert.equal(result.value.hops.length, 2);
    assert.ok(result.value.hops.every((hop) =>
      hop.kind && hop.confidence && hop.evidence.file
    ));
  }
});

test("path prefers a slightly longer resolved route over a syntactic shortcut", async () => {
  const database = fixtureDatabase(
    [
      node("start", "function", "start", "src/start.ts"),
      node("middle", "function", "middle", "src/middle.ts"),
      node("end", "function", "end", "src/end.ts"),
    ],
    [
      edge("start", "end", "calls", "syntactic", 1),
      edge("start", "middle", "calls", "resolved", 2),
      edge("middle", "end", "references", "resolved", 3),
    ],
  );

  const result = await shortestPath(database, "start", "end", 1_500);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.nodes.map((item) => item.id), [
      "start",
      "middle",
      "end",
    ]);
    assert.deepEqual(result.value.hops.map((hop) => hop.confidence), [
      "resolved",
      "resolved",
    ]);
  }
});

test("path prefers four resolved hops over a heuristic shortcut", async () => {
  const database = fixtureDatabase(
    [
      node("start", "function", "start", "src/start.ts"),
      node("one", "function", "one", "src/one.ts"),
      node("two", "function", "two", "src/two.ts"),
      node("three", "function", "three", "src/three.ts"),
      node("end", "function", "end", "src/end.ts"),
    ],
    [
      edge("start", "end", "calls", "heuristic", 1),
      edge("start", "one", "calls", "resolved", 2),
      edge("one", "two", "references", "resolved", 3),
      edge("two", "three", "references", "resolved", 4),
      edge("three", "end", "references", "resolved", 5),
    ],
  );

  const result = await shortestPath(database, "start", "end", 1_500);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.nodes.map((item) => item.id), [
      "start",
      "one",
      "two",
      "three",
      "end",
    ]);
    assert.ok(result.value.hops.every((hop) => hop.confidence === "resolved"));
  }
});

test("reverse traversal preserves displayed edge direction and annotates traversal", async () => {
  const database = fixtureDatabase(
    [
      node("login", "class", "LoginPage", "src/login.ts"),
      node("auth", "function", "authenticate", "src/auth.ts"),
      node("token", "class", "TokenStore", "src/token.ts"),
    ],
    [
      edge("login", "auth", "calls", "resolved", 4),
      edge("auth", "token", "references", "resolved", 9),
    ],
  );

  const result = await shortestPath(database, "TokenStore", "LoginPage", 1_500);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.nodes.map((item) => item.id), [
      "token",
      "auth",
      "login",
    ]);
    assert.deepEqual(
      result.value.hops.map((hop) => [hop.source, hop.target, hop.traversal]),
      [
        ["auth", "token", "reverse"],
        ["login", "auth", "reverse"],
      ],
    );
  }
});

test("path CLI keeps even tiny JSON output within the requested budget", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "repo-graph-path-budget-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await persistFixture(
    directory,
    [
      node("login", "class", "LoginPage", "src/login.ts"),
      node("token", "class", "TokenStore", "src/token.ts"),
    ],
    [edge("login", "token", "references", "resolved", 1)],
  );
  let stdout = "";

  const exitCode = await main(
    ["path", "LoginPage", "TokenStore", "--format", "json", "--budget", "1"],
    {
      cwd: directory,
      stdout: (value) => {
        stdout += value;
      },
      stderr: () => undefined,
    },
  );

  assert.equal(exitCode, ExitCode.Ok);
  assert.doesNotThrow(() => JSON.parse(stdout));
  assert.ok(estimateTokens(stdout) <= 1);
});

test("text path output sanitizes repository-derived control characters", async () => {
  const start = node("start", "function", "Unsafe\tStart\u001b", "src/start.ts");
  const end = node("end", "function", "Unsafe\u0085End", "src/end.ts");
  const result = await shortestPath(
    fixtureDatabase([start, end], [edge("start", "end", "calls", "resolved", 1)]),
    "start",
    "end",
    1_500,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const output = renderExplainedPath(result.value, "text", 1_500);

  assert.doesNotMatch(output, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u);
});
