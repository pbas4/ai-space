import { createPrograms } from "../compiler/create-programs.js";
import { loadCompiler } from "../compiler/load-compiler.js";
import { discoverRepository } from "../discovery/discover.js";
import type { Result } from "../domain/diagnostic.js";
import { resolveLocalRepository } from "../local/path-policy.js";
import { GraphDatabase } from "../storage/database.js";
import {
  INDEX_FINGERPRINT_METADATA_KEYS,
} from "../storage/schema.js";
import {
  buildFullIndex,
  type FullIndexOptions,
  type IndexSummary,
} from "./full.js";
import { createIndexFingerprint } from "./fingerprint.js";

export type UpdateIndexOptions = FullIndexOptions;

export interface UpdateIndexSummary extends IndexSummary {
  reused: boolean;
}

async function rebuildIndex(
  inputPath: string,
  options: UpdateIndexOptions,
): Promise<Result<UpdateIndexSummary>> {
  const rebuilt = await buildFullIndex(inputPath, options);
  if (!rebuilt.ok) return rebuilt;
  return {
    ...rebuilt,
    value: { ...rebuilt.value, reused: false },
  };
}

/**
 * Updates a repository index while preserving clean-rebuild equivalence.
 *
 * An unchanged, complete index is reused. Any fingerprint or version change
 * conservatively invalidates the whole graph and delegates to the full atomic
 * builder, which also preserves the previous readable index on failure.
 */
export async function updateIndex(
  inputPath: string,
  options: UpdateIndexOptions,
): Promise<Result<UpdateIndexSummary>> {
  if (options.format !== "text" && options.format !== "json") {
    return rebuildIndex(inputPath, options);
  }

  const repository = await resolveLocalRepository(
    inputPath,
    options.cwd ?? process.cwd(),
  );
  if (!repository.ok) return repository;

  const discovery = await discoverRepository(repository.value);
  if (!discovery.ok) return discovery;
  const compiler = await loadCompiler(repository.value.root);
  if (!compiler.ok) return compiler;

  const programs = await createPrograms(compiler.value, discovery.value);
  if (!programs.ok || programs.diagnostics.length !== 0) {
    return rebuildIndex(inputPath, options);
  }

  let fingerprint;
  try {
    fingerprint = await createIndexFingerprint(
      repository.value.root,
      discovery.value,
      compiler.value,
      programs.value,
    );
  } catch {
    return rebuildIndex(inputPath, options);
  }
  if (!fingerprint.reusable) return rebuildIndex(inputPath, options);

  const database = new GraphDatabase();
  const opened = await database.openExisting(repository.value);
  if (!opened.ok) return rebuildIndex(inputPath, options);

  const metadata = await database.metadata();
  const unchanged = INDEX_FINGERPRINT_METADATA_KEYS.every(
    (key) => metadata[key] === fingerprint.fingerprint[key],
  );
  if (!unchanged || metadata.complete !== true) {
    return rebuildIndex(inputPath, options);
  }

  const [stats, nodes, edges] = await Promise.all([
    database.stats(),
    database.nodes(),
    database.edges(),
  ]);
  const resolvedEdges = edges.filter(
    (edge) => edge.confidence === "resolved",
  ).length;
  return {
    ok: true,
    value: {
      repository: repository.value.root,
      projects: programs.value.length,
      files: discovery.value.sourceFiles.length,
      nodes: nodes.length,
      edges: stats.edgeCount,
      resolvedEdges,
      unresolvedEdges: stats.edgeCount - resolvedEdges,
      diagnostics: stats.diagnosticCount,
      database: ".repo-graph/index.sqlite",
      reused: true,
    },
    diagnostics: [],
  };
}
