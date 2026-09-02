import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createPrograms } from "../compiler/create-programs.js";
import { loadCompiler } from "../compiler/load-compiler.js";
import { discoverRepository } from "../discovery/discover.js";
import {
  ExitCode,
  redactDiagnostic,
  type Diagnostic,
  type Result,
} from "../domain/diagnostic.js";
import type { GraphFragment } from "../domain/graph.js";
import { extractNodes } from "../extract/nodes.js";
import { extractRelations } from "../extract/relations.js";
import { resolveLocalRepository } from "../local/path-policy.js";
import {
  normalizeGraph,
  validateNormalizedGraph,
} from "../normalize/normalize.js";
import type { OutputFormat } from "../cli/args.js";
import { createIndexFingerprint } from "./fingerprint.js";

export interface FullIndexOptions {
  format: OutputFormat;
  cwd?: string;
}

export interface IndexSummary {
  repository: string;
  projects: number;
  files: number;
  nodes: number;
  edges: number;
  resolvedEdges: number;
  unresolvedEdges: number;
  diagnostics: number;
  database: ".repo-graph/index.sqlite";
}

function internalFailure<T>(code: string, message: string): Result<T> {
  return {
    ok: false,
    exitCode: ExitCode.InternalFailure,
    diagnostics: [{ code, level: "error", message }],
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mergeDiagnostics(
  groups: ReadonlyArray<readonly Diagnostic[]>,
): Diagnostic[] {
  const diagnostics = new Map<string, Diagnostic>();
  for (const group of groups) {
    for (const diagnostic of group) {
      const copy = redactDiagnostic(diagnostic);
      const key = [
        copy.file ?? "",
        copy.code,
        copy.level,
        copy.message,
      ].join("\0");
      diagnostics.set(key, copy);
    }
  }
  return [...diagnostics.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, diagnostic]) => diagnostic);
}

async function assignPackageNames(
  repositoryRoot: string,
  packageJsonFiles: readonly string[],
  fragments: readonly GraphFragment[],
): Promise<void> {
  const packages: Array<{ directory: string; name: string }> = [];
  for (const packageFile of packageJsonFiles) {
    try {
      const contents = JSON.parse(
        await readFile(join(repositoryRoot, packageFile), "utf8"),
      ) as { name?: unknown };
      if (typeof contents.name !== "string" || contents.name.length === 0) {
        continue;
      }
      const directory = dirname(packageFile);
      packages.push({ directory: directory === "." ? "" : directory, name: contents.name });
    } catch {
      // Package metadata is optional; indexing continues without an association.
    }
  }
  packages.sort((left, right) =>
    right.directory.length - left.directory.length ||
    compareText(left.directory, right.directory)
  );
  for (const fragment of fragments) {
    for (const node of fragment.nodes) {
      const owner = packages.find(({ directory }) =>
        directory === "" ||
        node.sourceFile === directory ||
        node.sourceFile.startsWith(`${directory}/`)
      );
      if (owner !== undefined) node.packageName = owner.name;
    }
  }
}

export async function buildFullIndex(
  inputPath: string,
  options: FullIndexOptions,
): Promise<Result<IndexSummary>> {
  if (options.format !== "text" && options.format !== "json") {
    return {
      ok: false,
      exitCode: ExitCode.InvalidInput,
      diagnostics: [
        {
          code: "INVALID_FORMAT",
          level: "error",
          message: "Index output format must be text or json.",
        },
      ],
    };
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
  if (!programs.ok) return programs;

  const declarationsByProject = programs.value.map((project) =>
    extractNodes(project, repository.value.root)
  );
  const declarations: GraphFragment[] = declarationsByProject.flat();
  const fragments: GraphFragment[] = programs.value.flatMap((project, index) =>
    extractRelations(
      project,
      declarationsByProject[index] ?? [],
      repository.value.root,
      declarations,
    )
  );
  await assignPackageNames(
    repository.value.root,
    discovery.value.packageJsonFiles,
    fragments,
  );
  const normalized = normalizeGraph(fragments);
  if (!normalized.ok) return normalized;
  const graph = {
    ...normalized.value,
    diagnostics: mergeDiagnostics([
      discovery.diagnostics,
      programs.diagnostics,
      normalized.value.diagnostics,
    ]),
  };
  const validation = validateNormalizedGraph(graph);
  if (!validation.ok) return validation;

  let fingerprint;
  try {
    fingerprint = await createIndexFingerprint(
      repository.value.root,
      discovery.value,
      compiler.value,
      programs.value,
    );
  } catch {
    return internalFailure(
      "INDEX_HASH_FAILED",
      "Repository index metadata could not be hashed.",
    );
  }

  const { GraphDatabase } = await import("../storage/database.js");
  const persisted = await new GraphDatabase().createAtomic(
    repository.value,
    graph,
    {
      ...fingerprint.fingerprint,
      complete: graph.diagnostics.length === 0,
    },
  );
  if (!persisted.ok) return persisted;

  const resolvedEdges = graph.edges.filter(
    (edge) => edge.confidence === "resolved",
  ).length;
  const summary: IndexSummary = {
    repository: repository.value.root,
    projects: programs.value.length,
    files: discovery.value.sourceFiles.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    resolvedEdges,
    unresolvedEdges: graph.edges.length - resolvedEdges,
    diagnostics: graph.diagnostics.length,
    database: ".repo-graph/index.sqlite",
  };
  const diagnostics: Diagnostic[] = graph.diagnostics.map(
    (diagnostic) => ({ ...diagnostic }),
  );
  return { ok: true, value: summary, diagnostics };
}
