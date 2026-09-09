import type { GraphEdge, GraphNode } from "../domain/graph.js";
import type { QuerySubgraph, RankedNode } from "./traverse.js";
import type { SearchHit } from "./search.js";

export type RenderFormat = "text" | "json";

export interface RenderOptions {
  format: RenderFormat;
  tokenBudget: number;
}

export interface SelectedRenderFacts {
  intent: QuerySubgraph["intent"];
  seeds: SearchHit[];
  nodes: RankedNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export function sanitizeTextField(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ");
}

interface NodeFact {
  id: string;
  kind: GraphNode["kind"];
  name: string;
  path: string;
  line: number;
}

interface EdgeFact {
  source: string;
  target: string;
  kind: GraphEdge["kind"];
  confidence: GraphEdge["confidence"];
  evidence: { file: string; line: number };
}

function nodeFact(node: GraphNode): NodeFact {
  return {
    id: node.id,
    kind: node.kind,
    name: node.qualifiedName,
    path: node.sourceFile,
    line: node.startLine,
  };
}

function edgeFact(edge: GraphEdge): EdgeFact {
  return {
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
    confidence: edge.confidence,
    evidence: {
      file: edge.evidence.file,
      line: edge.evidence.startLine,
    },
  };
}

function renderJson(facts: SelectedRenderFacts): string {
  return JSON.stringify({
    intent: facts.intent,
    seeds: facts.seeds.map(nodeFact),
    nodes: facts.nodes.map(nodeFact),
    edges: facts.edges.map(edgeFact),
    truncated: facts.truncated,
    ...(facts.truncated
      ? { followUp: "Narrow the query or increase the token budget." }
      : {}),
  });
}

function renderText(facts: SelectedRenderFacts): string {
  const lines = ["repo-graph query", `intent: ${facts.intent}`, "seeds:"];
  for (const seed of facts.seeds) {
    const fact = nodeFact(seed);
    lines.push(`- ${fact.id} ${fact.name} [${fact.kind}] ${fact.path}:${fact.line}`);
  }
  lines.push("edges:");
  for (const edge of facts.edges) {
    const fact = edgeFact(edge);
    lines.push(
      `- ${fact.source} -[${fact.kind} ${fact.confidence}]-> ${fact.target} @ ${fact.evidence.file}:${fact.evidence.line}`,
    );
  }
  lines.push("nodes:");
  for (const node of facts.nodes) {
    const fact = nodeFact(node);
    lines.push(`- ${fact.id} ${fact.name} [${fact.kind}] ${fact.path}:${fact.line}`);
  }
  lines.push(`truncated: ${facts.truncated ? "true" : "false"}`);
  if (facts.truncated) {
    lines.push("follow-up: Narrow the query or increase the token budget.");
  }
  return `${lines.map(sanitizeTextField).join("\n")}\n`;
}

function render(facts: SelectedRenderFacts, format: RenderFormat): string {
  return format === "json" ? renderJson(facts) : renderText(facts);
}

function fitsBoth(facts: SelectedRenderFacts, tokenBudget: number): boolean {
  return estimateTokens(renderText(facts)) <= tokenBudget &&
    estimateTokens(renderJson(facts)) <= tokenBudget;
}

function copyFacts(facts: SelectedRenderFacts): SelectedRenderFacts {
  return {
    intent: facts.intent,
    seeds: [...facts.seeds],
    nodes: [...facts.nodes],
    edges: [...facts.edges],
    truncated: facts.truncated,
  };
}

function pushFitting<T extends "seeds" | "edges" | "nodes">(
  facts: SelectedRenderFacts,
  key: T,
  candidates: SelectedRenderFacts[T],
  tokenBudget: number,
): void {
  for (const candidate of candidates) {
    const attempted = copyFacts(facts);
    (attempted[key] as Array<(typeof candidates)[number]>).push(candidate);
    if (!fitsBoth(attempted, tokenBudget)) break;
    (facts[key] as Array<(typeof candidates)[number]>).push(candidate);
  }
}

export function estimateTokens(output: string): number {
  return Math.ceil(Buffer.byteLength(output, "utf8") / 4);
}

export function selectRenderFacts(
  subgraph: QuerySubgraph,
  tokenBudget: number,
): SelectedRenderFacts {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 1) {
    throw new RangeError("tokenBudget must be a positive integer.");
  }
  const facts: SelectedRenderFacts = {
    intent: subgraph.intent,
    seeds: [],
    nodes: [],
    edges: [],
    truncated: true,
  };
  const uniqueSeeds = subgraph.seeds.filter(
    (seed, index) => subgraph.seeds.findIndex((item) => item.id === seed.id) === index,
  );
  const seedIds = new Set(uniqueSeeds.map((seed) => seed.id));
  const optionalNodes = subgraph.nodes.filter((node) => !seedIds.has(node.id));

  const required = copyFacts(facts);
  required.seeds.push(...uniqueSeeds);
  if (!fitsBoth(required, tokenBudget)) return facts;
  facts.seeds.push(...uniqueSeeds);
  pushFitting(facts, "edges", subgraph.edges, tokenBudget);
  pushFitting(facts, "nodes", optionalNodes, tokenBudget);

  const complete = facts.seeds.length === uniqueSeeds.length &&
    facts.edges.length === subgraph.edges.length &&
    facts.nodes.length === optionalNodes.length;
  if (complete) {
    const untruncated = { ...facts, truncated: false };
    if (fitsBoth(untruncated, tokenBudget)) return untruncated;
  }
  return facts;
}

function tinyFallback(format: RenderFormat, tokenBudget: number): string {
  const candidates = format === "json"
    ? ["{\"truncated\":true}", "{}"]
    : ["truncated: true\n", "truncated", "…", ""];
  return candidates.find((candidate) => estimateTokens(candidate) <= tokenBudget) ?? "";
}

export function renderSubgraph(
  subgraph: QuerySubgraph,
  options: RenderOptions,
): string {
  const facts = selectRenderFacts(subgraph, options.tokenBudget);
  const output = render(facts, options.format);
  if (estimateTokens(output) <= options.tokenBudget) return output;
  return tinyFallback(options.format, options.tokenBudget);
}
