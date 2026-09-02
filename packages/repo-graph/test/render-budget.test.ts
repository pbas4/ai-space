import assert from "node:assert/strict";
import test from "node:test";

import type { GraphEdge, GraphNode, NodeKind } from "../src/domain/graph.js";
import {
  estimateTokens,
  renderSubgraph,
  selectRenderFacts,
} from "../src/query/render.js";
import type { QuerySubgraph, RankedNode } from "../src/query/traverse.js";

function node(index: number, kind: NodeKind = "function"): RankedNode {
  const base: GraphNode = {
    id: `node-${String(index).padStart(2, "0")}`,
    kind,
    label: `operation${index}`,
    qualifiedName: `AuthenticationService.operation${index}`,
    sourceFile: `packages/auth/src/operation-${index}.ts`,
    startLine: index + 1,
    startColumn: 1,
    endLine: index + 2,
    endColumn: 40,
    packageName: "@fixture/auth",
    projectPath: "packages/auth/tsconfig.json",
    exported: index % 2 === 0,
    signature: `(input: Input${index}) => Output${index}`,
    summary: `Performs authentication operation ${index}.`,
  };
  return {
    ...base,
    distance: index === 0 ? 0 : 1,
    rankScore: 100 - index,
  };
}

function edge(index: number): GraphEdge {
  return {
    source: "node-00",
    target: `node-${String(index).padStart(2, "0")}`,
    kind: "calls",
    confidence: index % 3 === 0 ? "resolved" : index % 3 === 1 ? "syntactic" : "heuristic",
    evidence: {
      file: `packages/auth/src/operation-${index}.ts`,
      startLine: index + 10,
      startColumn: 3,
      endLine: index + 10,
      endColumn: 22,
    },
  };
}

function largeSubgraph(): QuerySubgraph {
  const nodes = Array.from({ length: 18 }, (_, index) => node(index));
  return {
    intent: "call",
    seeds: [{
      ...nodes[0]!,
      exact: true,
      lexicalScore: 1_000,
      matchedTerms: ["authenticationservice"],
    }],
    nodes,
    edges: Array.from({ length: 17 }, (_, index) => edge(index + 1)),
  };
}

test("renderer never exceeds its documented estimate budget", () => {
  const output = renderSubgraph(largeSubgraph(), {
    format: "text",
    tokenBudget: 100,
  });

  assert.ok(estimateTokens(output) <= 100);
  assert.match(output, /truncated/i);
});

test("token estimates use ceiling of UTF-8 bytes divided by four", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
  assert.equal(estimateTokens("🙂"), 1);
  assert.equal(estimateTokens("🙂a"), 2);
});

test("text and JSON select the same facts and expose confidence with evidence", () => {
  const subgraph = largeSubgraph();
  const budget = 220;
  const selected = selectRenderFacts(subgraph, budget);
  const text = renderSubgraph(subgraph, { format: "text", tokenBudget: budget });
  const json = renderSubgraph(subgraph, { format: "json", tokenBudget: budget });
  const parsed = JSON.parse(json) as {
    seeds: Array<{ id: string }>;
    nodes: Array<{ id: string }>;
    edges: Array<{ source: string; target: string; confidence: string; evidence: { file: string; line: number } }>;
    truncated: boolean;
  };

  assert.deepEqual(parsed.seeds.map((item) => item.id), selected.seeds.map((item) => item.id));
  assert.deepEqual(parsed.nodes.map((item) => item.id), selected.nodes.map((item) => item.id));
  assert.deepEqual(
    parsed.edges.map((item) => [item.source, item.target]),
    selected.edges.map((item) => [item.source, item.target]),
  );
  for (const selectedEdge of selected.edges) {
    assert.match(text, new RegExp(`${selectedEdge.confidence}.*${selectedEdge.evidence.file}:${selectedEdge.evidence.startLine}`));
  }
  assert.ok(parsed.edges.every((item) => item.confidence && item.evidence.file && item.evidence.line > 0));
  assert.equal(estimateTokens(text) <= budget, true);
  assert.equal(estimateTokens(json) <= budget, true);
});

test("mandatory seed and truncation reserve wins over optional nodes", () => {
  const subgraph = largeSubgraph();
  const selected = selectRenderFacts(subgraph, 80);
  const text = renderSubgraph(subgraph, { format: "text", tokenBudget: 80 });

  assert.equal(selected.seeds[0]?.id, subgraph.seeds[0]?.id);
  assert.ok(selected.nodes.length < subgraph.nodes.length);
  assert.equal(selected.truncated, true);
  assert.match(text, /narrow the query|increase the token budget/i);
  assert.ok(estimateTokens(text) <= 80);
});

test("mandatory seeds are atomic before edges or optional nodes", () => {
  const subgraph = largeSubgraph();
  const secondSeed = {
    ...subgraph.nodes[1]!,
    qualifiedName: `OversizedSeed${"x".repeat(2_000)}`,
    exact: true,
    lexicalScore: 900,
    matchedTerms: ["oversizedseed"],
  };
  subgraph.seeds.push(secondSeed);
  const budget = 220;

  const selected = selectRenderFacts(subgraph, budget);
  const text = renderSubgraph(subgraph, { format: "text", tokenBudget: budget });
  const json = renderSubgraph(subgraph, { format: "json", tokenBudget: budget });
  const parsed = JSON.parse(json) as {
    seeds?: Array<{ id: string }>;
    nodes?: Array<{ id: string }>;
    edges?: Array<{ source: string; target: string }>;
    truncated: boolean;
  };

  assert.deepEqual(selected.seeds, []);
  assert.deepEqual(selected.edges, []);
  assert.deepEqual(selected.nodes, []);
  assert.deepEqual(parsed.seeds ?? [], []);
  assert.deepEqual(parsed.edges ?? [], []);
  assert.deepEqual(parsed.nodes ?? [], []);
  assert.equal(parsed.truncated, true);
  assert.match(text, /truncated/i);
  assert.ok(!text.includes("-["));
  assert.ok(estimateTokens(text) <= budget);
  assert.ok(estimateTokens(json) <= budget);
});

test("tiny budgets remain hard for text and valid JSON", () => {
  const subgraph = largeSubgraph();
  for (const budget of [1, 3, 5, 10, 20]) {
    const text = renderSubgraph(subgraph, { format: "text", tokenBudget: budget });
    const json = renderSubgraph(subgraph, { format: "json", tokenBudget: budget });
    assert.ok(estimateTokens(text) <= budget, `text budget ${budget}`);
    assert.ok(estimateTokens(json) <= budget, `json budget ${budget}`);
    assert.doesNotThrow(() => JSON.parse(json));
  }
});
