import { posix } from "node:path";

import type { GraphNode } from "../domain/graph.js";
import type { GraphDatabase } from "../storage/database.js";
import {
  renderSubgraph,
  type RenderFormat,
} from "./render.js";
import {
  traverse,
  type QuerySubgraph,
} from "./traverse.js";

export type QueryIntent =
  | "architecture"
  | "dependency"
  | "call"
  | "path"
  | "test"
  | "impact";

export interface SearchHit extends GraphNode {
  exact: boolean;
  lexicalScore: number;
  matchedTerms: string[];
}

export interface QueryOptions {
  tokenBudget: number;
  format?: RenderFormat;
  seedLimit?: number;
  maxDepth?: number;
  maxNodes?: number;
}

export interface QueryResult extends QuerySubgraph {
  output: string;
}

const INTENT_TERMS: ReadonlyArray<{
  intent: Exclude<QueryIntent, "architecture">;
  terms: ReadonlySet<string>;
}> = [
  { intent: "impact", terms: new Set(["impact", "affected", "affects", "break", "breaks", "change", "changes", "dependant", "dependants", "dependent", "dependents"]) },
  { intent: "test", terms: new Set(["test", "tests", "tested", "spec", "specs", "coverage", "cover"]) },
  { intent: "call", terms: new Set(["call", "calls", "called", "calling", "flow", "invoke", "invokes", "runtime"]) },
  { intent: "dependency", terms: new Set(["dependency", "dependencies", "depend", "depends", "import", "imports", "reference", "references", "uses"]) },
  { intent: "path", terms: new Set(["path", "route", "between", "connection", "connected"]) },
];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function words(value: string): string[] {
  return [...new Set(
    (value.normalize("NFKC").match(/[\p{L}\p{N}_$.-]+/gu) ?? [])
      .map((term) => term.toLocaleLowerCase("en-US"))
      .filter(Boolean),
  )];
}

function normalizeIdentifier(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizePath(value: string): string {
  return posix.normalize(value.trim().replaceAll("\\", "/")).replace(/^\.\//u, "").toLocaleLowerCase("en-US");
}

function symbolWeight(node: GraphNode): number {
  if (["file", "repository", "package", "project", "external_module", "unresolved_symbol"].includes(node.kind)) {
    return 0;
  }
  return 50;
}

function scoreNode(
  node: GraphNode,
  terms: readonly string[],
  ftsRank: number | undefined,
  queryPath: string,
): SearchHit | undefined {
  const normalizedTerms = terms.map(normalizeIdentifier).filter(Boolean);
  const label = normalizeIdentifier(node.label);
  const qualifiedName = normalizeIdentifier(node.qualifiedName);
  const sourceFile = normalizePath(node.sourceFile);
  const pathExact = queryPath.length > 0 && sourceFile === queryPath;
  const exactTerms = terms.filter((term) => {
    const normalized = normalizeIdentifier(term);
    return normalized.length > 0 && (normalized === label || normalized === qualifiedName);
  });
  const partialTerms = terms.filter((term) => {
    const normalized = normalizeIdentifier(term);
    return normalized.length > 1 &&
      (label.includes(normalized) || qualifiedName.includes(normalized) || sourceFile.includes(normalizePath(term)));
  });
  if (!pathExact && exactTerms.length === 0 && partialTerms.length === 0 && ftsRank === undefined) {
    return undefined;
  }
  const matchedTerms = [...new Set([...exactTerms, ...partialTerms])];
  const exact = pathExact || exactTerms.length > 0;
  const lexicalScore =
    (pathExact ? 12_000 : 0) +
    exactTerms.length * 10_000 +
    partialTerms.length * 500 +
    (ftsRank === undefined ? 0 : Math.max(1, 1_000 - ftsRank)) +
    (node.exported ? 100 : 0) +
    symbolWeight(node) +
    normalizedTerms.filter((term) => qualifiedName.includes(term)).length;
  return { ...node, exact, lexicalScore, matchedTerms };
}

function validateLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1) return 0;
  return Math.min(limit, 100);
}

export function classifyIntent(question: string): QueryIntent {
  const terms = new Set(words(question).map(normalizeIdentifier));
  for (const candidate of INTENT_TERMS) {
    if ([...candidate.terms].some((term) => terms.has(term))) return candidate.intent;
  }
  return "architecture";
}

export async function searchSeeds(
  database: GraphDatabase,
  question: string,
  limit: number,
): Promise<SearchHit[]> {
  const boundedLimit = validateLimit(limit);
  const terms = words(question);
  if (boundedLimit === 0 || terms.length === 0) return [];
  const allNodes = await database.nodes();
  const ftsRanks = new Map<string, number>();
  const ftsLimit = Math.min(100, Math.max(32, boundedLimit * 8));
  for (const term of terms) {
    const matches = await database.searchNodes(term, ftsLimit);
    for (const [rank, node] of matches.entries()) {
      const previous = ftsRanks.get(node.id);
      if (previous === undefined || rank < previous) ftsRanks.set(node.id, rank);
    }
  }
  const queryPath = normalizePath(question);
  const ranked = allNodes
    .flatMap((node) => {
      const hit = scoreNode(node, terms, ftsRanks.get(node.id), queryPath);
      return hit === undefined ? [] : [hit];
    })
    .sort((left, right) =>
      Number(right.exact) - Number(left.exact) ||
      right.lexicalScore - left.lexicalScore ||
      compareText(left.id, right.id)
    );

  const selected: SearchHit[] = [];
  const files = new Set<string>();
  for (const hit of ranked) {
    if (files.has(hit.sourceFile)) continue;
    selected.push(hit);
    files.add(hit.sourceFile);
    if (selected.length === boundedLimit) return selected;
  }
  for (const hit of ranked) {
    if (selected.some((selectedHit) => selectedHit.id === hit.id)) continue;
    selected.push(hit);
    if (selected.length === boundedLimit) break;
  }
  return selected;
}

export async function queryGraph(
  database: GraphDatabase,
  question: string,
  options: QueryOptions,
): Promise<QueryResult> {
  const intent = classifyIntent(question);
  const seeds = await searchSeeds(database, question, options.seedLimit ?? 5);
  const subgraph = await traverse(database, seeds, {
    intent,
    maxDepth: options.maxDepth ?? 3,
    maxNodes: options.maxNodes ?? 100,
    queryTerms: words(question),
  });
  return {
    ...subgraph,
    output: renderSubgraph(subgraph, {
      format: options.format ?? "text",
      tokenBudget: options.tokenBudget,
    }),
  };
}
