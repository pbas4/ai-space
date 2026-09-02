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

export interface ImpactHop extends GraphEdge {
  traversal: "reverse";
}

export interface ImpactItem extends GraphNode {
  depth: number;
  confidence: Confidence;
  hops: ImpactHop[];
}

export interface ImpactPackage {
  packageName: string;
  depth: number;
  confidence: "resolved";
  impactedNodeIds: string[];
  hops: ImpactHop[];
}

export interface ImpactReport {
  selector: GraphNode;
  direct: ImpactItem[];
  transitive: ImpactItem[];
  packages: ImpactPackage[];
  tests: ImpactItem[];
  uncertain: ImpactItem[];
  truncated: boolean;
}

export interface ImpactOptions {
  depth: number;
  tokenBudget: number;
}

interface PathState {
  nodeId: string;
  confidence: Confidence;
  hops: ImpactHop[];
  pathKey: string;
}

const IMPACT_EDGES: ReadonlySet<EdgeKind> = new Set([
  "imports",
  "references",
  "calls",
  "instantiates",
  "extends",
  "implements",
  "overrides",
  "tests",
]);

const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = {
  resolved: 3,
  syntactic: 2,
  heuristic: 1,
};

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
    edge.evidence.endLine,
    edge.evidence.endColumn,
  ].join("\0");
}

function stateKey(nodeId: string, confidence: Confidence): string {
  return `${nodeId}\0${confidence}`;
}

function weakestConfidence(
  left: Confidence,
  right: Confidence,
): Confidence {
  return CONFIDENCE_RANK[left] <= CONFIDENCE_RANK[right] ? left : right;
}

function copyHop(edge: GraphEdge): ImpactHop {
  return {
    ...edge,
    evidence: { ...edge.evidence },
    ...(edge.diagnostic === undefined
      ? {}
      : { diagnostic: { ...edge.diagnostic } }),
    traversal: "reverse",
  };
}

function betterState(left: PathState, right: PathState): number {
  return CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence] ||
    left.hops.length - right.hops.length ||
    compareText(left.pathKey, right.pathKey);
}

function isTestImpact(item: ImpactItem): boolean {
  return item.kind === "test" ||
    item.hops.some((hop) => hop.kind === "tests") ||
    /(?:^|[./_-])(?:test|tests|spec)(?:[./_-]|$)/iu.test(item.sourceFile);
}

function compareImpactItems(left: ImpactItem, right: ImpactItem): number {
  return left.depth - right.depth ||
    compareText(left.packageName ?? "", right.packageName ?? "") ||
    compareText(left.qualifiedName, right.qualifiedName) ||
    compareText(left.id, right.id);
}

function makePackages(items: readonly ImpactItem[]): ImpactPackage[] {
  const grouped = new Map<string, Map<number, ImpactItem[]>>();
  for (const item of items) {
    if (item.packageName === null) continue;
    const depths = grouped.get(item.packageName) ?? new Map<number, ImpactItem[]>();
    const group = depths.get(item.depth) ?? [];
    group.push(item);
    depths.set(item.depth, group);
    grouped.set(item.packageName, depths);
  }
  return [...grouped.entries()].flatMap(([packageName, depths]) =>
    [...depths.entries()].map(([depth, members]) => {
      const ordered = [...members].sort(compareImpactItems);
      const explanation = ordered[0]!;
      return {
        packageName,
        depth,
        confidence: "resolved" as const,
        impactedNodeIds: ordered.map((item) => item.id).sort(compareText),
        hops: explanation.hops.map((hop) => copyHop(hop)),
      };
    })
  ).sort((left, right) =>
    left.depth - right.depth || compareText(left.packageName, right.packageName)
  );
}

function renderText(report: ImpactReport): string {
  const lines = [
    "repo-graph impact",
    `selector: ${report.selector.id} ${report.selector.qualifiedName} ${report.selector.sourceFile}:${report.selector.startLine}`,
  ];
  const addItems = (label: string, items: readonly ImpactItem[]): void => {
    lines.push(`${label}:`);
    for (const item of items) {
      lines.push(
        `- ${item.id} ${item.qualifiedName} [${item.kind}] ${item.sourceFile}:${item.startLine} depth=${item.depth} confidence=${item.confidence}`,
      );
      for (const hop of item.hops) {
        lines.push(
          `  - ${hop.source} -[${hop.kind} ${hop.confidence}]-> ${hop.target} traversal=reverse @ ${hop.evidence.file}:${hop.evidence.startLine}`,
        );
      }
    }
  };
  addItems("direct", report.direct);
  addItems("transitive", report.transitive);
  lines.push("packages:");
  for (const item of report.packages) {
    lines.push(
      `- ${item.packageName} depth=${item.depth} confidence=${item.confidence} nodes=${item.impactedNodeIds.join(",")}`,
    );
    for (const hop of item.hops) {
      lines.push(
        `  - ${hop.source} -[${hop.kind} ${hop.confidence}]-> ${hop.target} traversal=reverse @ ${hop.evidence.file}:${hop.evidence.startLine}`,
      );
    }
  }
  addItems("tests", report.tests);
  addItems("uncertain", report.uncertain);
  lines.push(`truncated: ${report.truncated ? "true" : "false"}`);
  if (report.truncated) {
    lines.push("follow-up: Increase --depth or --budget to inspect more impact.");
  }
  return `${lines.map(sanitizeTextField).join("\n")}\n`;
}

function renderJson(report: ImpactReport): string {
  return `${JSON.stringify(report)}\n`;
}

function fitsReport(report: ImpactReport, tokenBudget: number): boolean {
  return estimateTokens(renderJson(report)) <= tokenBudget &&
    estimateTokens(renderText(report)) <= tokenBudget;
}

function emptyReport(selector: GraphNode, truncated: boolean): ImpactReport {
  return {
    selector: { ...selector },
    direct: [],
    transitive: [],
    packages: [],
    tests: [],
    uncertain: [],
    truncated,
  };
}

function applyTokenBudget(
  report: ImpactReport,
  tokenBudget: number,
): ImpactReport {
  if (fitsReport(report, tokenBudget)) return report;
  const selected = emptyReport(report.selector, true);
  const categories = [
    "direct",
    "tests",
    "transitive",
    "packages",
    "uncertain",
  ] as const;
  for (const category of categories) {
    for (const item of report[category]) {
      const candidate = {
        ...selected,
        [category]: [...selected[category], item],
      };
      if (!fitsReport(candidate, tokenBudget)) continue;
      selected[category].push(item as never);
    }
  }
  return selected;
}

function tinyFallback(format: RenderFormat, tokenBudget: number): string {
  const candidates = format === "json"
    ? ["{\"truncated\":true}\n", "{}\n"]
    : ["truncated: true\n", "truncated", "…", ""];
  return candidates.find((candidate) => estimateTokens(candidate) <= tokenBudget) ?? "";
}

export function renderImpactReport(
  report: ImpactReport,
  format: RenderFormat,
  tokenBudget: number,
): string {
  if (!Number.isInteger(tokenBudget) || tokenBudget < 1) {
    throw new RangeError("tokenBudget must be a positive integer.");
  }
  const output = format === "json" ? renderJson(report) : renderText(report);
  return estimateTokens(output) <= tokenBudget
    ? output
    : tinyFallback(format, tokenBudget);
}

export async function analyzeImpact(
  database: GraphDatabase,
  selector: string,
  options: ImpactOptions,
): Promise<Result<ImpactReport>> {
  if (!Number.isInteger(options.depth) || options.depth < 1) {
    return invalid("INVALID_DEPTH", "Impact depth must be a positive integer.");
  }
  if (!Number.isInteger(options.tokenBudget) || options.tokenBudget < 1) {
    return invalid("INVALID_BUDGET", "Token budget must be a positive integer.");
  }
  const resolved = await resolveSelector(database, selector);
  if (!resolved.ok) return resolved;
  const [nodes, edges] = await Promise.all([
    database.nodes(),
    database.edges(),
  ]);
  const nodesById = new Map(nodes.map((item) => [item.id, item] as const));
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (!IMPACT_EDGES.has(edge.kind)) continue;
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    const adjacent = incoming.get(edge.target) ?? [];
    adjacent.push(edge);
    incoming.set(edge.target, adjacent);
  }
  for (const adjacent of incoming.values()) {
    adjacent.sort((left, right) => compareText(edgeKey(left), edgeKey(right)));
  }

  const seedId = resolved.value.node.id;
  const seed: PathState = {
    nodeId: seedId,
    confidence: "resolved",
    hops: [],
    pathKey: seedId,
  };
  const states = new Map<string, PathState>([
    [stateKey(seed.nodeId, seed.confidence), seed],
  ]);
  let frontier = [seed];
  for (let depth = 0; depth < options.depth && frontier.length > 0; depth += 1) {
    const next = new Map<string, PathState>();
    for (const current of frontier.sort((left, right) =>
      betterState(left, right) || compareText(left.nodeId, right.nodeId)
    )) {
      for (const edge of incoming.get(current.nodeId) ?? []) {
        if (current.hops.some((hop) => hop.source === edge.source)) continue;
        const confidence = weakestConfidence(current.confidence, edge.confidence);
        const hop = copyHop(edge);
        const candidate: PathState = {
          nodeId: edge.source,
          confidence,
          hops: [hop, ...current.hops],
          pathKey: `${edgeKey(edge)}\0${current.pathKey}`,
        };
        const key = stateKey(candidate.nodeId, candidate.confidence);
        const existing = states.get(key);
        if (existing !== undefined && betterState(candidate, existing) >= 0) {
          continue;
        }
        states.set(key, candidate);
        const queued = next.get(key);
        if (queued === undefined || betterState(candidate, queued) < 0) {
          next.set(key, candidate);
        }
      }
    }
    frontier = [...next.values()];
  }

  const bestByNode = new Map<string, PathState>();
  for (const state of states.values()) {
    if (state.nodeId === seedId || state.hops.length === 0) continue;
    const existing = bestByNode.get(state.nodeId);
    if (existing === undefined || betterState(state, existing) < 0) {
      bestByNode.set(state.nodeId, state);
    }
  }
  const allItems = [...bestByNode.values()].flatMap((state) => {
    const graphNode = nodesById.get(state.nodeId);
    return graphNode === undefined
      ? []
      : [{
        ...graphNode,
        depth: state.hops.length,
        confidence: state.confidence,
        hops: state.hops.map((hop) => copyHop(hop)),
      } satisfies ImpactItem];
  }).sort(compareImpactItems);
  const confirmed = allItems.filter((item) => item.confidence === "resolved");
  const tests = confirmed.filter(isTestImpact);
  const nonTests = confirmed.filter((item) => !isTestImpact(item));
  const direct = nonTests.filter((item) => item.depth === 1);
  const transitive = nonTests.filter((item) => item.depth > 1);
  const uncertain = allItems.filter((item) => item.confidence !== "resolved");
  const depthTruncated = frontier.some((current) =>
    (incoming.get(current.nodeId) ?? []).some((edge) => {
      if (
        edge.source === seedId ||
        current.hops.some((hop) => hop.source === edge.source)
      ) {
        return false;
      }
      const candidate: PathState = {
        nodeId: edge.source,
        confidence: weakestConfidence(current.confidence, edge.confidence),
        hops: [copyHop(edge), ...current.hops],
        pathKey: `${edgeKey(edge)}\0${current.pathKey}`,
      };
      const existing = bestByNode.get(candidate.nodeId);
      return existing === undefined || betterState(candidate, existing) < 0;
    })
  );
  const report: ImpactReport = {
    selector: { ...resolved.value.node },
    direct,
    transitive,
    packages: makePackages(confirmed),
    tests,
    uncertain,
    truncated: depthTruncated,
  };
  return {
    ok: true,
    value: applyTokenBudget(report, options.tokenBudget),
    diagnostics: [],
  };
}
