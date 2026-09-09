import type {
  Confidence,
  EdgeKind,
  GraphEdge,
  GraphNode,
} from "../domain/graph.js";
import type { GraphDatabase } from "../storage/database.js";
import type { QueryIntent, SearchHit } from "./search.js";

export interface TraversalPolicy {
  intent: QueryIntent;
  maxDepth: number;
  maxNodes: number;
  queryTerms?: readonly string[];
}

export interface RankedNode extends GraphNode {
  distance: number;
  rankScore: number;
}

export interface QuerySubgraph {
  intent: QueryIntent;
  seeds: SearchHit[];
  nodes: RankedNode[];
  edges: GraphEdge[];
}

type Direction = "outgoing" | "incoming" | "both";

interface IntentTraversal {
  direction: Direction;
  kinds: ReadonlySet<EdgeKind>;
}

const STRUCTURE_EDGES: readonly EdgeKind[] = [
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
];

const INTENT_TRAVERSAL: Readonly<Record<QueryIntent, IntentTraversal>> = {
  architecture: {
    direction: "both",
    kinds: new Set(STRUCTURE_EDGES),
  },
  dependency: {
    direction: "both",
    kinds: new Set<EdgeKind>([
      "contains",
      "declares",
      "imports",
      "dynamically_imports",
      "exports",
      "re_exports",
      "references",
      "extends",
      "implements",
      "instantiates",
    ]),
  },
  call: {
    direction: "outgoing",
    kinds: new Set<EdgeKind>([
      "contains",
      "declares",
      "calls",
      "instantiates",
      "overrides",
    ]),
  },
  path: {
    direction: "both",
    kinds: new Set<EdgeKind>([
      ...STRUCTURE_EDGES,
      "calls",
      "references",
      "instantiates",
      "tests",
    ]),
  },
  test: {
    direction: "both",
    kinds: new Set<EdgeKind>([
      "contains",
      "declares",
      "tests",
      "calls",
      "references",
      "imports",
    ]),
  },
  impact: {
    direction: "incoming",
    kinds: new Set<EdgeKind>([
      "contains",
      "declares",
      "imports",
      "dynamically_imports",
      "exports",
      "re_exports",
      "calls",
      "references",
      "extends",
      "implements",
      "overrides",
      "instantiates",
      "tests",
    ]),
  },
};

const CONFIDENCE_SCORE: Readonly<Record<Confidence, number>> = {
  resolved: 300,
  syntactic: 200,
  heuristic: 100,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeTerm(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "");
}

function lexicalScore(node: GraphNode, terms: readonly string[]): number {
  const fields = [node.label, node.qualifiedName, node.sourceFile].map(normalizeTerm);
  let score = 0;
  for (const term of terms.map(normalizeTerm).filter(Boolean)) {
    if (fields.some((field) => field === term)) score += 120;
    else if (fields.some((field) => field.includes(term))) score += 40;
  }
  return score;
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

function validBound(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

export async function traverse(
  database: GraphDatabase,
  seeds: readonly SearchHit[],
  policy: TraversalPolicy,
): Promise<QuerySubgraph> {
  validBound(policy.maxDepth, "maxDepth");
  validBound(policy.maxNodes, "maxNodes");
  if (policy.maxNodes === 0 || seeds.length === 0) {
    return { intent: policy.intent, seeds: [], nodes: [], edges: [] };
  }

  const [allNodes, allEdges] = await Promise.all([
    database.nodes(),
    database.edges(),
  ]);
  const nodesById = new Map(allNodes.map((node) => [node.id, node] as const));
  const traversal = INTENT_TRAVERSAL[policy.intent];
  const allowedEdges = allEdges
    .filter((edge) => traversal.kinds.has(edge.kind))
    .sort((left, right) => compareText(edgeKey(left), edgeKey(right)));
  const adjacency = new Map<string, Array<{ edge: GraphEdge; neighbor: string }>>();
  const add = (id: string, edge: GraphEdge, neighbor: string): void => {
    const adjacent = adjacency.get(id) ?? [];
    adjacent.push({ edge, neighbor });
    adjacency.set(id, adjacent);
  };
  for (const edge of allowedEdges) {
    if (traversal.direction !== "incoming") add(edge.source, edge, edge.target);
    if (traversal.direction !== "outgoing") add(edge.target, edge, edge.source);
  }

  const uniqueSeeds = seeds
    .filter((seed, index) => seeds.findIndex((item) => item.id === seed.id) === index)
    .filter((seed) => nodesById.has(seed.id))
    .slice(0, policy.maxNodes);
  const degree = new Map<string, number>();
  for (const edge of allowedEdges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const seedProjects = new Set(uniqueSeeds.map((seed) => seed.projectPath));
  const seedScores = new Map(uniqueSeeds.map((seed) => [seed.id, seed.lexicalScore] as const));
  const queryTerms = policy.queryTerms ?? uniqueSeeds.flatMap((seed) => seed.matchedTerms);
  const score = (id: string, hop: number, confidence: number): number => {
    const graphNode = nodesById.get(id);
    if (graphNode === undefined) return Number.MIN_SAFE_INTEGER;
    return (seedScores.get(id) ?? lexicalScore(graphNode, queryTerms)) * 1_000 +
      confidence * 100 +
      Math.max(0, 20 - hop) * 100 +
      (graphNode.exported ? 500 : 0) +
      (seedProjects.has(graphNode.projectPath) ? 250 : 0) +
      Math.min(degree.get(id) ?? 0, 100);
  };
  const distance = new Map<string, number>();
  const pathConfidence = new Map<string, number>();
  const queue: string[] = [];
  for (const seed of uniqueSeeds) {
    distance.set(seed.id, 0);
    pathConfidence.set(seed.id, CONFIDENCE_SCORE.resolved);
    queue.push(seed.id);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const currentDistance = distance.get(current)!;
    if (currentDistance >= policy.maxDepth) continue;
    const adjacent = [...(adjacency.get(current) ?? [])].sort((left, right) => {
      const hop = currentDistance + 1;
      const currentConfidence = pathConfidence.get(current) ?? 0;
      const leftScore = score(
        left.neighbor,
        hop,
        Math.min(currentConfidence, CONFIDENCE_SCORE[left.edge.confidence]),
      );
      const rightScore = score(
        right.neighbor,
        hop,
        Math.min(currentConfidence, CONFIDENCE_SCORE[right.edge.confidence]),
      );
      return rightScore - leftScore ||
        compareText(left.neighbor, right.neighbor) ||
        compareText(edgeKey(left.edge), edgeKey(right.edge));
    });
    for (const { edge, neighbor } of adjacent) {
      const nextDistance = currentDistance + 1;
      const previousDistance = distance.get(neighbor);
      const confidence = Math.min(
        pathConfidence.get(current) ?? 0,
        CONFIDENCE_SCORE[edge.confidence],
      );
      if (previousDistance === undefined) {
        if (distance.size >= policy.maxNodes) continue;
        distance.set(neighbor, nextDistance);
        pathConfidence.set(neighbor, confidence);
        queue.push(neighbor);
      } else if (nextDistance === previousDistance) {
        pathConfidence.set(
          neighbor,
          Math.max(pathConfidence.get(neighbor) ?? 0, confidence),
        );
      }
    }
  }

  const ranked = [...distance.entries()]
    .flatMap(([id, hop]) => {
      const graphNode = nodesById.get(id);
      if (graphNode === undefined) return [];
      const rankScore = score(id, hop, pathConfidence.get(id) ?? 0);
      return [{ ...graphNode, distance: hop, rankScore }];
    })
    .sort((left, right) => right.rankScore - left.rankScore || compareText(left.id, right.id))
    .slice(0, policy.maxNodes);
  const selectedIds = new Set(ranked.map((node) => node.id));
  const nodeRank = new Map(ranked.map((node, index) => [node.id, index] as const));
  const selectedEdges = allowedEdges
    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .sort((left, right) => {
      const leftRank = Math.min(nodeRank.get(left.source)!, nodeRank.get(left.target)!);
      const rightRank = Math.min(nodeRank.get(right.source)!, nodeRank.get(right.target)!);
      return leftRank - rightRank ||
        CONFIDENCE_SCORE[right.confidence] - CONFIDENCE_SCORE[left.confidence] ||
        compareText(edgeKey(left), edgeKey(right));
    });

  return {
    intent: policy.intent,
    seeds: uniqueSeeds.map((seed) => ({ ...seed, matchedTerms: [...seed.matchedTerms] })),
    nodes: ranked,
    edges: selectedEdges,
  };
}
