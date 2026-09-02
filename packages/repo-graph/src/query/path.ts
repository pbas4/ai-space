import {
  ExitCode,
  type Result,
} from "../domain/diagnostic.js";
import type {
  Confidence,
  EdgeKind,
  GraphEdge,
  GraphNode,
} from "../domain/graph.js";
import type { GraphDatabase } from "../storage/database.js";
import { resolveSelector } from "./explain.js";
import {
  estimateTokens,
  sanitizeTextField,
  type RenderFormat,
} from "./render.js";

export interface ExplainedHop extends GraphEdge {
  traversal: "forward" | "reverse";
}

export interface ExplainedPath {
  from: GraphNode;
  to: GraphNode;
  nodes: GraphNode[];
  hops: ExplainedHop[];
  totalCost: number;
}

interface PathNodeFact {
  id: string;
  kind: GraphNode["kind"];
  name: string;
  path: string;
  line: number;
}

interface PathHopFact {
  source: string;
  target: string;
  kind: EdgeKind;
  confidence: Confidence;
  evidence: { file: string; line: number };
  traversal: ExplainedHop["traversal"];
}

const PATH_EDGES: ReadonlySet<EdgeKind> = new Set([
  "contains",
  "declares",
  "imports",
  "dynamically_imports",
  "exports",
  "re_exports",
  "extends",
  "implements",
  "overrides",
  "configured_by",
  "calls",
  "references",
  "instantiates",
  "tests",
]);

const EDGE_COST: Readonly<Record<Confidence, number>> = {
  resolved: 1,
  syntactic: 3,
  heuristic: 5,
};

interface Adjacent {
  neighbor: string;
  hop: ExplainedHop;
}

interface Previous {
  node: string;
  hop: ExplainedHop;
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

function edgeKey(edge: GraphEdge): string {
  return [
    edge.source,
    edge.target,
    edge.kind,
    edge.confidence,
    edge.evidence.file,
    edge.evidence.startLine,
    edge.evidence.startColumn,
  ].join("\0");
}

function nodeFact(node: GraphNode): PathNodeFact {
  return {
    id: node.id,
    kind: node.kind,
    name: node.qualifiedName,
    path: node.sourceFile,
    line: node.startLine,
  };
}

function hopFact(hop: ExplainedHop): PathHopFact {
  return {
    source: hop.source,
    target: hop.target,
    kind: hop.kind,
    confidence: hop.confidence,
    evidence: { file: hop.evidence.file, line: hop.evidence.startLine },
    traversal: hop.traversal,
  };
}

function renderFullPath(path: ExplainedPath, format: RenderFormat): string {
  if (format === "json") {
    return `${JSON.stringify({
      from: nodeFact(path.from),
      to: nodeFact(path.to),
      nodes: path.nodes.map(nodeFact),
      hops: path.hops.map(hopFact),
      totalCost: path.totalCost,
      truncated: false,
    })}\n`;
  }
  const lines = [
    "repo-graph path",
    `from: ${path.from.id} ${path.from.qualifiedName} ${path.from.sourceFile}:${path.from.startLine}`,
    `to: ${path.to.id} ${path.to.qualifiedName} ${path.to.sourceFile}:${path.to.startLine}`,
    "hops:",
  ];
  for (const hop of path.hops) {
    lines.push(
      `- ${hop.source} -[${hop.kind} ${hop.confidence}]-> ${hop.target} traversal=${hop.traversal} @ ${hop.evidence.file}:${hop.evidence.startLine}`,
    );
  }
  lines.push("nodes:");
  for (const node of path.nodes) {
    lines.push(`- ${node.id} ${node.qualifiedName} [${node.kind}] ${node.sourceFile}:${node.startLine}`);
  }
  lines.push(`total-cost: ${path.totalCost}`, "truncated: false");
  return `${lines.map(sanitizeTextField).join("\n")}\n`;
}

export function renderExplainedPath(
  path: ExplainedPath,
  format: RenderFormat,
  tokenBudget: number,
): string {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 1) {
    throw new RangeError("tokenBudget must be a positive integer.");
  }
  const output = renderFullPath(path, format);
  if (estimateTokens(output) <= tokenBudget) return output;
  const fallbacks = format === "json"
    ? ["{\"truncated\":true}\n", "{}\n"]
    : ["truncated: true\n", "truncated", "…", ""];
  return fallbacks.find((candidate) => estimateTokens(candidate) <= tokenBudget) ?? "";
}

export async function shortestPath(
  database: GraphDatabase,
  from: string,
  to: string,
  budget: number,
): Promise<Result<ExplainedPath>> {
  if (!Number.isInteger(budget) || budget < 1) {
    return invalid("INVALID_BUDGET", "Token budget must be a positive integer.");
  }
  const start = await resolveSelector(database, from);
  if (!start.ok) return start;
  const end = await resolveSelector(database, to);
  if (!end.ok) return end;
  const [nodes, edges] = await Promise.all([
    database.nodes(),
    database.edges(),
  ]);
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const adjacency = new Map<string, Adjacent[]>();
  const add = (id: string, adjacent: Adjacent): void => {
    const entries = adjacency.get(id) ?? [];
    entries.push(adjacent);
    adjacency.set(id, entries);
  };
  for (const edge of edges.filter((item) => PATH_EDGES.has(item.kind))) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    add(edge.source, {
      neighbor: edge.target,
      hop: { ...edge, evidence: { ...edge.evidence }, traversal: "forward" },
    });
    add(edge.target, {
      neighbor: edge.source,
      hop: { ...edge, evidence: { ...edge.evidence }, traversal: "reverse" },
    });
  }
  for (const entries of adjacency.values()) {
    entries.sort((left, right) =>
      compareText(left.neighbor, right.neighbor) ||
      compareText(edgeKey(left.hop), edgeKey(right.hop)) ||
      compareText(left.hop.traversal, right.hop.traversal)
    );
  }

  const startId = start.value.node.id;
  const endId = end.value.node.id;
  const distance = new Map<string, number>([[startId, 0]]);
  const pathKey = new Map<string, string>([[startId, startId]]);
  const previous = new Map<string, Previous>();
  const unsettled = new Set<string>([startId]);
  while (unsettled.size > 0) {
    const current = [...unsettled].sort((left, right) =>
      (distance.get(left) ?? Number.POSITIVE_INFINITY) -
        (distance.get(right) ?? Number.POSITIVE_INFINITY) ||
      compareText(pathKey.get(left) ?? "", pathKey.get(right) ?? "") ||
      compareText(left, right)
    )[0]!;
    unsettled.delete(current);
    if (current === endId) break;
    for (const adjacent of adjacency.get(current) ?? []) {
      const candidateDistance = distance.get(current)! +
        EDGE_COST[adjacent.hop.confidence];
      const candidateKey = [
        pathKey.get(current) ?? current,
        adjacent.hop.traversal,
        edgeKey(adjacent.hop),
        adjacent.neighbor,
      ].join("\0");
      const knownDistance = distance.get(adjacent.neighbor);
      const knownKey = pathKey.get(adjacent.neighbor);
      if (
        knownDistance !== undefined &&
        (candidateDistance > knownDistance ||
          (candidateDistance === knownDistance &&
            knownKey !== undefined &&
            compareText(candidateKey, knownKey) >= 0))
      ) {
        continue;
      }
      distance.set(adjacent.neighbor, candidateDistance);
      pathKey.set(adjacent.neighbor, candidateKey);
      previous.set(adjacent.neighbor, { node: current, hop: adjacent.hop });
      unsettled.add(adjacent.neighbor);
    }
  }

  if (!distance.has(endId)) {
    return invalid(
      "PATH_NOT_FOUND",
      `No allowed architectural path connects ${JSON.stringify(from)} and ${JSON.stringify(to)}.`,
    );
  }
  const nodeIds = [endId];
  const hops: ExplainedHop[] = [];
  let cursor = endId;
  while (cursor !== startId) {
    const entry = previous.get(cursor);
    if (entry === undefined) {
      return invalid("PATH_NOT_FOUND", "The selected path could not be reconstructed.");
    }
    hops.push(entry.hop);
    cursor = entry.node;
    nodeIds.push(cursor);
  }
  nodeIds.reverse();
  hops.reverse();
  return {
    ok: true,
    value: {
      from: { ...start.value.node },
      to: { ...end.value.node },
      nodes: nodeIds.map((id) => ({ ...nodesById.get(id)! })),
      hops,
      totalCost: distance.get(endId)!,
    },
    diagnostics: [],
  };
}
