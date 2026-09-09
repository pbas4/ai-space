import { stat } from "node:fs/promises";
import { join } from "node:path";

import type { Confidence } from "../domain/graph.js";
import { inspectRepository, type IndexState } from "./status.js";

export interface StatsReport {
  repository: string;
  state: IndexState;
  counts: {
    projects: number;
    files: number;
    nodes: number;
    edges: number;
    diagnostics: number;
  };
  confidence: Record<Confidence, number>;
  topPackages: Array<{ name: string; nodes: number }>;
  databaseBytes: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function getStats(
  inputPath: string,
  cwd: string = process.cwd(),
): Promise<StatsReport> {
  const context = await inspectRepository(inputPath, cwd);
  const [databaseStats, nodes, edges, databaseFile] =
    context.database === undefined
      ? [undefined, [], [], undefined] as const
      : await Promise.all([
        context.database.stats(),
        context.database.nodes(),
        context.database.edges(),
        stat(join(context.repository.dataDir, "index.sqlite")),
      ]);
  const confidence: Record<Confidence, number> = {
    resolved: 0,
    syntactic: 0,
    heuristic: 0,
  };
  for (const edge of edges) confidence[edge.confidence] += 1;
  const projects = new Set(nodes.map((node) => node.projectPath));
  const packageCounts = new Map<string, number>();
  for (const node of nodes) {
    const packageName = node.packageName ?? undefined;
    if (packageName === undefined) continue;
    packageCounts.set(packageName, (packageCounts.get(packageName) ?? 0) + 1);
  }
  const topPackages = [...packageCounts]
    .map(([name, packageNodes]) => ({ name, nodes: packageNodes }))
    .sort((left, right) =>
      right.nodes - left.nodes || compareText(left.name, right.name)
    )
    .slice(0, 10);

  return {
    repository: context.repository.root,
    state: context.status.state,
    counts: {
      projects: projects.size,
      files: nodes.filter((node) => node.kind === "file").length,
      nodes: databaseStats?.nodeCount ?? 0,
      edges: databaseStats?.edgeCount ?? 0,
      diagnostics: databaseStats?.diagnosticCount ?? 0,
    },
    confidence,
    topPackages,
    databaseBytes: databaseFile?.size ?? 0,
  };
}
