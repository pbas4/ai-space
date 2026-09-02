import { posix } from "node:path";

import {
  ExitCode,
  type Result,
} from "../domain/diagnostic.js";
import type { GraphNode } from "../domain/graph.js";
import type { GraphDatabase } from "../storage/database.js";
import { traverse, type QuerySubgraph } from "./traverse.js";

export type SelectorMatch = "id" | "path" | "qualifiedName" | "fts";

export interface ResolvedSelector {
  node: GraphNode;
  matchedBy: SelectorMatch;
}

function invalid<T>(code: string, message: string): Result<T> {
  return {
    ok: false,
    exitCode: ExitCode.InvalidInput,
    diagnostics: [{ code, level: "error", message }],
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(nodes: readonly GraphNode[]): GraphNode[] {
  return nodes
    .filter((item, index) => nodes.findIndex((other) => other.id === item.id) === index)
    .sort((left, right) => compareText(left.id, right.id));
}

function candidateDetails(nodes: readonly GraphNode[]): string {
  return nodes.map((node) =>
    `${node.id} (${node.qualifiedName}, ${node.sourceFile}:${node.startLine})`
  ).join("; ");
}

function choose(
  selector: string,
  matchedBy: SelectorMatch,
  nodes: readonly GraphNode[],
): Result<ResolvedSelector> | undefined {
  const candidates = unique(nodes);
  if (candidates.length === 0) return undefined;
  if (candidates.length > 1) {
    return invalid(
      "AMBIGUOUS_SELECTOR",
      `Selector ${JSON.stringify(selector)} is ambiguous. Use an exact node ID or qualified name: ${candidateDetails(candidates)}.`,
    );
  }
  return {
    ok: true,
    value: { node: { ...candidates[0]! }, matchedBy },
    diagnostics: [],
  };
}

function normalizedPath(selector: string): string | undefined {
  const withSlashes = selector.replaceAll("\\", "/");
  const normalized = posix.normalize(withSlashes).replace(/^\.\//u, "");
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    return undefined;
  }
  return normalized;
}

export async function resolveSelector(
  database: GraphDatabase,
  selector: string,
): Promise<Result<ResolvedSelector>> {
  const requested = selector.trim();
  if (requested.length === 0) {
    return invalid("EMPTY_SELECTOR", "Selector must not be empty.");
  }
  const nodes = await database.nodes();
  const byId = choose(requested, "id", nodes.filter((node) => node.id === requested));
  if (byId !== undefined) return byId;

  const path = normalizedPath(requested);
  if (path !== undefined) {
    const pathMatches = nodes.filter((node) =>
      node.sourceFile === path && node.kind === "file"
    );
    const byPath = choose(requested, "path", pathMatches);
    if (byPath !== undefined) return byPath;
  }

  const byQualifiedName = choose(
    requested,
    "qualifiedName",
    nodes.filter((node) => node.qualifiedName === requested),
  );
  if (byQualifiedName !== undefined) return byQualifiedName;

  const byFts = choose(
    requested,
    "fts",
    await database.searchNodes(requested, 20),
  );
  if (byFts !== undefined) return byFts;
  return invalid(
    "SELECTOR_NOT_FOUND",
    `Selector ${JSON.stringify(requested)} did not match an indexed node.`,
  );
}

export async function explainNode(
  database: GraphDatabase,
  selector: string,
  budget: number,
): Promise<Result<QuerySubgraph>> {
  if (!Number.isInteger(budget) || budget < 1) {
    return invalid("INVALID_BUDGET", "Token budget must be a positive integer.");
  }
  const resolved = await resolveSelector(database, selector);
  if (!resolved.ok) return resolved;
  const exact = resolved.value.matchedBy !== "fts";
  const seed = {
    ...resolved.value.node,
    exact,
    lexicalScore: exact ? 10_000 : 1_000,
    matchedTerms: [selector.trim()],
  };
  const subgraph = await traverse(database, [seed], {
    intent: "architecture",
    maxDepth: 3,
    maxNodes: Math.min(100, Math.max(1, Math.floor(budget / 10))),
    queryTerms: [selector],
  });
  return { ok: true, value: subgraph, diagnostics: [] };
}
