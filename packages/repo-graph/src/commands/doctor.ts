import { isAbsolute, relative, sep, win32 } from "node:path";

import type { Diagnostic } from "../domain/diagnostic.js";
import {
  GraphDatabase,
  type ForeignKeyViolation,
} from "../storage/database.js";
import { inspectRepository, type IndexState } from "./status.js";

export interface DoctorReport {
  repository: string;
  state: IndexState;
  compiler: {
    source: "local" | "bundled" | null;
    version: string | null;
    indexedVersion: string | null;
    compatible: boolean;
  };
  configuration: {
    projects: number;
    projectReferences: string[];
    configErrors: Diagnostic[];
  };
  coverage: {
    discoveredFiles: number;
    indexedFiles: number;
    skippedFilesByReason: { ignored: number; unindexed: number };
    parseFailures: number;
    unresolvedEdges: number;
    totalEdges: number;
    unresolvedEdgeRatio: number;
  };
  privacy: { absolutePaths: number; violations: string[] };
  foreignKeys: { healthy: boolean; violations: ForeignKeyViolation[] };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function repositoryPath(root: string, candidate: string): string | undefined {
  const value = relative(root, candidate);
  if (value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value)) {
    return undefined;
  }
  return value.split(sep).join("/");
}

function absolutePath(value: string): boolean {
  return isAbsolute(value) || win32.isAbsolute(value);
}

export async function runDoctor(
  inputPath: string,
  cwd: string = process.cwd(),
): Promise<DoctorReport> {
  const context = await inspectRepository(inputPath, cwd);
  const { database, discovery, compiler, programs = [] } = context;
  const audit = await new GraphDatabase().auditExisting(context.repository);
  const [nodes, edges] = database === undefined
    ? [[], []] as const
    : await Promise.all([
      database.nodes(),
      database.edges(),
    ]);
  const foreignKeyViolations = audit.ok
    ? audit.value.foreignKeyViolations
    : [];
  const storedPaths = audit.ok ? audit.value.storedPaths : [];

  const projectReferences = new Set<string>();
  for (const project of programs) {
    for (const reference of project.program.getProjectReferences() ?? []) {
      const path = repositoryPath(context.repository.root, reference.path);
      if (path !== undefined) projectReferences.add(path);
    }
  }
  const configErrors = programs
    .flatMap((project) => project.diagnostics)
    .filter(
      (diagnostic) =>
        diagnostic.level === "error" &&
        (diagnostic.file === undefined || diagnostic.file.endsWith(".json")),
    )
    .map((diagnostic) => ({ ...diagnostic }))
    .sort((left, right) =>
      compareText(
        `${left.file ?? ""}\0${left.code}\0${left.message}`,
        `${right.file ?? ""}\0${right.code}\0${right.message}`,
      )
    );
  const parseFailures = programs.reduce(
    (total, project) => total + project.program.getSyntacticDiagnostics().length,
    0,
  );
  const unresolvedEdges = edges.filter(
    (edge) => edge.confidence !== "resolved",
  ).length;
  const privacyViolations = new Set<string>();
  for (const path of storedPaths) {
    if (absolutePath(path.value)) {
      privacyViolations.add(`${path.source}:${path.id}:${path.field}`);
    }
  }
  const violations = [...privacyViolations].sort(compareText);
  const discoveredFiles = discovery?.sourceFiles.length ?? 0;
  const indexedFiles = nodes.filter((node) => node.kind === "file").length;
  return {
    repository: context.repository.root,
    state: context.status.state,
    compiler: {
      source: compiler?.source ?? null,
      version: compiler?.version ?? null,
      indexedVersion: context.status.compilerVersion,
      compatible:
        compiler !== undefined &&
        context.status.compilerVersion === compiler.version,
    },
    configuration: {
      projects: programs.length,
      projectReferences: [...projectReferences].sort(compareText),
      configErrors,
    },
    coverage: {
      discoveredFiles,
      indexedFiles,
      skippedFilesByReason: {
        ignored: discovery?.ignoredFiles ?? 0,
        unindexed: Math.max(0, discoveredFiles - indexedFiles),
      },
      parseFailures,
      unresolvedEdges,
      totalEdges: edges.length,
      unresolvedEdgeRatio: edges.length === 0 ? 0 : unresolvedEdges / edges.length,
    },
    privacy: { absolutePaths: violations.length, violations },
    foreignKeys: {
      healthy: audit.ok && foreignKeyViolations.length === 0,
      violations: foreignKeyViolations.map((violation) => ({ ...violation })),
    },
  };
}
