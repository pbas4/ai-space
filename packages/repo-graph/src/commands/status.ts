import type { ProjectProgram } from "../compiler/create-programs.js";
import { createPrograms } from "../compiler/create-programs.js";
import type { CompilerAdapter } from "../compiler/load-compiler.js";
import { loadCompiler } from "../compiler/load-compiler.js";
import type { Discovery } from "../discovery/discover.js";
import { discoverRepository } from "../discovery/discover.js";
import type { Diagnostic, ExitCode as ExitCodeValue } from "../domain/diagnostic.js";
import { createIndexFingerprint, TOOL_VERSION } from "../indexer/fingerprint.js";
import type { LocalRepository } from "../local/path-policy.js";
import { resolveLocalRepository } from "../local/path-policy.js";
import { GraphDatabase } from "../storage/database.js";
import { SCHEMA_VERSION } from "../storage/schema.js";

export type IndexState =
  | "missing"
  | "current"
  | "stale"
  | "incompatible"
  | "corrupt";

export interface StatusReport {
  repository: string;
  database: ".repo-graph/index.sqlite";
  state: IndexState;
  schemaVersion: number | null;
  toolVersion: string | null;
  compilerVersion: string | null;
  contentHashMatches: boolean | null;
  configHashMatches: boolean | null;
  complete: boolean | null;
}

export interface DiagnosticContext {
  repository: LocalRepository;
  status: StatusReport;
  database?: GraphDatabase;
  discovery?: Discovery;
  compiler?: CompilerAdapter;
  programs?: ProjectProgram[];
}

export class DiagnosticCommandError extends Error {
  constructor(
    readonly exitCode: ExitCodeValue,
    readonly diagnostics: Diagnostic[],
  ) {
    super("Diagnostic command input is invalid.");
  }
}

function report(
  repository: LocalRepository,
  state: IndexState,
  values: Partial<Omit<StatusReport, "repository" | "database" | "state">> = {},
): StatusReport {
  return {
    repository: repository.root,
    database: ".repo-graph/index.sqlite",
    state,
    schemaVersion: values.schemaVersion ?? null,
    toolVersion: values.toolVersion ?? null,
    compilerVersion: values.compilerVersion ?? null,
    contentHashMatches: values.contentHashMatches ?? null,
    configHashMatches: values.configHashMatches ?? null,
    complete: values.complete ?? null,
  };
}

function metadataString(
  metadata: Readonly<Record<string, string | number | boolean | null>>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Inspects repository and index state without creating or replacing files. */
export async function inspectRepository(
  inputPath: string,
  cwd: string = process.cwd(),
): Promise<DiagnosticContext> {
  const resolved = await resolveLocalRepository(inputPath, cwd);
  if (!resolved.ok) {
    throw new DiagnosticCommandError(resolved.exitCode, resolved.diagnostics);
  }
  const repository = resolved.value;
  const database = new GraphDatabase();
  const opened = await database.openExisting(repository);
  if (!opened.ok) {
    const code = opened.diagnostics[0]?.code;
    const state: IndexState = code === "MISSING_INDEX"
      ? "missing"
      : code === "INCOMPATIBLE_INDEX"
      ? "incompatible"
      : "corrupt";
    return { repository, status: report(repository, state) };
  }

  let metadata: Record<string, string | number | boolean | null>;
  try {
    metadata = await database.metadata();
  } catch {
    return { repository, status: report(repository, "corrupt") };
  }

  const schemaVersion = metadata.schemaVersion;
  const toolVersion = metadataString(metadata, "toolVersion");
  const indexedCompilerVersion = metadataString(metadata, "compilerVersion");
  const contentHash = metadataString(metadata, "contentHash");
  const configHash = metadataString(metadata, "configHash");
  const complete = metadata.complete;
  const metadataValues = {
    schemaVersion: typeof schemaVersion === "number" ? schemaVersion : null,
    toolVersion: toolVersion ?? null,
    compilerVersion: indexedCompilerVersion ?? null,
    complete: typeof complete === "boolean" ? complete : null,
  };
  if (
    schemaVersion !== SCHEMA_VERSION ||
    toolVersion === undefined ||
    indexedCompilerVersion === undefined ||
    contentHash === undefined ||
    configHash === undefined ||
    typeof complete !== "boolean"
  ) {
    return {
      repository,
      status: report(repository, "corrupt", metadataValues),
      database,
    };
  }
  if (toolVersion !== TOOL_VERSION) {
    return {
      repository,
      status: report(repository, "incompatible", metadataValues),
      database,
    };
  }

  const discovery = await discoverRepository(repository);
  if (!discovery.ok) {
    return {
      repository,
      status: report(repository, "stale", metadataValues),
      database,
    };
  }
  const compiler = await loadCompiler(repository.root);
  if (!compiler.ok) {
    return {
      repository,
      status: report(repository, "incompatible", metadataValues),
      database,
      discovery: discovery.value,
    };
  }
  if (indexedCompilerVersion !== compiler.value.version) {
    return {
      repository,
      status: report(repository, "incompatible", metadataValues),
      database,
      discovery: discovery.value,
      compiler: compiler.value,
    };
  }
  const programs = await createPrograms(compiler.value, discovery.value);
  if (!programs.ok) {
    return {
      repository,
      status: report(repository, "stale", metadataValues),
      database,
      discovery: discovery.value,
      compiler: compiler.value,
    };
  }

  try {
    const fingerprint = await createIndexFingerprint(
      repository.root,
      discovery.value,
      compiler.value,
      programs.value,
    );
    const contentHashMatches = contentHash === fingerprint.fingerprint.contentHash;
    const configHashMatches = configHash === fingerprint.fingerprint.configHash;
    const state = contentHashMatches && configHashMatches && complete
      ? "current"
      : "stale";
    return {
      repository,
      status: report(repository, state, {
        ...metadataValues,
        contentHashMatches,
        configHashMatches,
      }),
      database,
      discovery: discovery.value,
      compiler: compiler.value,
      programs: programs.value,
    };
  } catch {
    return {
      repository,
      status: report(repository, "stale", metadataValues),
      database,
      discovery: discovery.value,
      compiler: compiler.value,
      programs: programs.value,
    };
  }
}

export async function getStatus(
  inputPath: string,
  cwd: string = process.cwd(),
): Promise<StatusReport> {
  return (await inspectRepository(inputPath, cwd)).status;
}
