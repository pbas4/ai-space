import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, rm, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  ExitCode,
  redactDiagnostic,
  type Diagnostic,
  type Result,
} from "../domain/diagnostic.js";
import type { GraphEdge, GraphNode } from "../domain/graph.js";
import type { LocalRepository } from "../local/path-policy.js";
import {
  type NormalizedGraph,
  validateNormalizedGraph,
} from "../normalize/normalize.js";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";

/** Scalar metadata approved for the versioned repository graph index. */
export interface IndexMetadata {
  readonly schemaVersion: number;
  readonly toolVersion?: string;
  readonly compilerVersion?: string;
  readonly contentHash?: string;
  readonly configHash?: string;
  readonly complete?: boolean;
}

export interface DatabaseStats {
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  diagnosticCount: number;
}

export interface ForeignKeyViolation {
  table: string;
  rowid: number | null;
  parent: string;
  fkid: number;
}

export interface StoredPath {
  source: "file" | "node" | "edge" | "diagnostic";
  id: string | number;
  field: "path" | "projectPath" | "sourceFile" | "evidence" | "diagnostic" | "file";
  value: string;
}

export interface DatabaseAudit {
  foreignKeyViolations: ForeignKeyViolation[];
  storedPaths: StoredPath[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareForeignKeyViolations(
  left: ForeignKeyViolation,
  right: ForeignKeyViolation,
): number {
  return compareText(left.table, right.table) ||
    (left.rowid ?? -1) - (right.rowid ?? -1) ||
    compareText(left.parent, right.parent) ||
    left.fkid - right.fkid;
}

interface CountRow {
  count: number;
}

interface DefensiveDatabase {
  enableDefensive?: (enabled: boolean) => void;
}

const METADATA_VALIDATORS: Readonly<Record<keyof IndexMetadata, (
  value: unknown,
) => boolean>> = {
  schemaVersion: (value) =>
    typeof value === "number" && Number.isInteger(value) && value > 0,
  toolVersion: (value) => typeof value === "string" && value.length > 0,
  compilerVersion: (value) => typeof value === "string" && value.length > 0,
  contentHash: (value) => typeof value === "string" && value.length > 0,
  configHash: (value) => typeof value === "string" && value.length > 0,
  complete: (value) => typeof value === "boolean",
};

function internalFailure<T = void>(code: string, message: string): Result<T> {
  return {
    ok: false,
    exitCode: ExitCode.InternalFailure,
    diagnostics: [{ code, level: "error", message }],
  };
}

function invalidFailure<T = void>(code: string, message: string): Result<T> {
  return {
    ok: false,
    exitCode: ExitCode.InvalidInput,
    diagnostics: [{ code, level: "error", message }],
  };
}

function unavailableFailure<T = void>(code: string, message: string): Result<T> {
  return {
    ok: false,
    exitCode: ExitCode.MissingOrStaleIndex,
    diagnostics: [{ code, level: "error", message }],
  };
}

function harden(database: DatabaseSync, readOnly: boolean): void {
  database.enableLoadExtension(false);
  const defensive = database as unknown as DefensiveDatabase;
  if (typeof defensive.enableDefensive === "function") {
    defensive.enableDefensive(true);
  }
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA trusted_schema = OFF");
  database.exec("PRAGMA recursive_triggers = OFF");
  if (readOnly) database.exec("PRAGMA query_only = ON");
}

function openDatabase(path: string, readOnly: boolean): DatabaseSync {
  const database = new DatabaseSync(path, {
    readOnly,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
  });
  harden(database, readOnly);
  return database;
}

function safeRepository(repo: LocalRepository): boolean {
  if (!isAbsolute(repo.root) || !isAbsolute(repo.dataDir)) return false;
  const expectedDataDir = resolve(repo.root, ".repo-graph");
  if (resolve(repo.dataDir) !== expectedDataDir) return false;
  const relativeDataDir = relative(repo.root, repo.dataDir);
  return relativeDataDir === ".repo-graph";
}

async function existingIndexPath(repo: LocalRepository): Promise<Result<string>> {
  if (!safeRepository(repo)) {
    return invalidFailure(
      "INVALID_DATA_DIRECTORY",
      "The graph database must be stored in the repository-local .repo-graph directory.",
    );
  }
  const indexPath = join(repo.dataDir, "index.sqlite");
  try {
    const index = await stat(indexPath);
    if (!index.isFile()) {
      return unavailableFailure(
        "UNUSABLE_INDEX",
        "The repository graph index is not a readable SQLite file; rebuild it with repo-graph index.",
      );
    }
  } catch {
    return unavailableFailure(
      "MISSING_INDEX",
      "No readable repository graph index was found; run repo-graph index first.",
    );
  }
  try {
    const [canonicalRoot, canonicalIndex] = await Promise.all([
      realpath(repo.root),
      realpath(indexPath),
    ]);
    if (
      relative(canonicalRoot, canonicalIndex) !==
        join(".repo-graph", "index.sqlite")
    ) {
      return unavailableFailure(
        "INDEX_OUTSIDE_REPOSITORY",
        "The repository graph index must resolve to the repository-local .repo-graph/index.sqlite file.",
      );
    }
  } catch {
    return unavailableFailure(
      "UNUSABLE_INDEX",
      "The repository graph index path could not be validated; rebuild it with repo-graph index.",
    );
  }
  return { ok: true, value: indexPath, diagnostics: [] };
}

function validMetadata(metadata: unknown): metadata is IndexMetadata {
  if (metadata === null || typeof metadata !== "object") return false;
  if (!Object.hasOwn(metadata, "schemaVersion")) return false;
  return Object.entries(metadata).every(([key, value]) => {
    if (!Object.hasOwn(METADATA_VALIDATORS, key)) return false;
    return METADATA_VALIDATORS[key as keyof IndexMetadata](value);
  });
}

function snapshotGraph(graph: NormalizedGraph): NormalizedGraph {
  return {
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      evidence: { ...edge.evidence },
      ...(edge.diagnostic === undefined
        ? {}
        : { diagnostic: redactDiagnostic(edge.diagnostic) }),
    })),
    diagnostics: graph.diagnostics.map(redactDiagnostic),
  };
}

function collectFiles(graph: NormalizedGraph): Array<{
  path: string;
  projectPath: string | null;
  packageName: string | null;
}> {
  const files = new Map<
    string,
    { path: string; projectPath: string | null; packageName: string | null }
  >();
  const add = (
    path: string,
    projectPath: string | null,
    packageName: string | null,
  ): void => {
    const existing = files.get(path);
    if (existing === undefined) {
      files.set(path, { path, projectPath, packageName });
      return;
    }
    if (
      projectPath !== null &&
      (existing.projectPath === null || projectPath < existing.projectPath)
    ) {
      existing.projectPath = projectPath;
    }
    if (
      packageName !== null &&
      (existing.packageName === null || packageName < existing.packageName)
    ) {
      existing.packageName = packageName;
    }
  };
  for (const node of graph.nodes) {
    add(node.sourceFile, node.projectPath || null, node.packageName);
  }
  for (const edge of graph.edges) {
    add(edge.evidence.file, null, null);
    if (edge.diagnostic?.file !== undefined) {
      add(edge.diagnostic.file, null, null);
    }
  }
  for (const diagnostic of graph.diagnostics) {
    if (diagnostic.file !== undefined) add(diagnostic.file, null, null);
  }
  return [...files.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
}

function insertGraph(
  database: DatabaseSync,
  graph: NormalizedGraph,
  metadata: IndexMetadata,
): void {
  const insertMetadata = database.prepare(
    "INSERT INTO metadata (key, value) VALUES (?, ?)",
  );
  const metadataEntries = Object.entries(metadata).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  );
  for (const [key, value] of metadataEntries) {
    insertMetadata.run(key, JSON.stringify(value));
  }

  const insertFile = database.prepare(
    "INSERT INTO files (path, project_path, package_name) VALUES (?, ?, ?)",
  );
  for (const file of collectFiles(graph)) {
    insertFile.run(file.path, file.projectPath, file.packageName);
  }

  const insertNode = database.prepare(`
    INSERT INTO nodes (
      id, kind, label, qualified_name, source_file,
      start_line, start_column, end_line, end_column,
      package_name, project_path, exported, signature, summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSearch = database.prepare(`
    INSERT INTO node_search (
      node_id, label, qualified_name, summary, source_file
    ) VALUES (?, ?, ?, ?, ?)
  `);
  for (const node of graph.nodes) {
    insertNode.run(
      node.id,
      node.kind,
      node.label,
      node.qualifiedName,
      node.sourceFile,
      node.startLine,
      node.startColumn,
      node.endLine,
      node.endColumn,
      node.packageName,
      node.projectPath,
      node.exported ? 1 : 0,
      node.signature,
      node.summary,
    );
    insertSearch.run(
      node.id,
      node.label,
      node.qualifiedName,
      node.summary,
      node.sourceFile,
    );
  }

  const insertEdge = database.prepare(`
    INSERT INTO edges (
      source_id, target_id, kind, confidence, evidence_file,
      start_line, start_column, end_line, end_column,
      diagnostic_code, diagnostic_level, diagnostic_message, diagnostic_file
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const edge of graph.edges) {
    insertEdge.run(
      edge.source,
      edge.target,
      edge.kind,
      edge.confidence,
      edge.evidence.file,
      edge.evidence.startLine,
      edge.evidence.startColumn,
      edge.evidence.endLine,
      edge.evidence.endColumn,
      edge.diagnostic?.code ?? null,
      edge.diagnostic?.level ?? null,
      edge.diagnostic?.message ?? null,
      edge.diagnostic?.file ?? null,
    );
  }

  const insertDiagnostic = database.prepare(
    "INSERT INTO diagnostics (code, level, message, file) VALUES (?, ?, ?, ?)",
  );
  for (const diagnostic of graph.diagnostics) {
    insertDiagnostic.run(
      diagnostic.code,
      diagnostic.level,
      diagnostic.message,
      diagnostic.file ?? null,
    );
  }
}

function count(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as
    | CountRow
    | undefined;
  if (row === undefined) throw new Error(`Missing count for ${table}.`);
  return row.count;
}

function validateWrittenDatabase(
  database: DatabaseSync,
  graph: NormalizedGraph,
): void {
  const expectedFiles = collectFiles(graph).length;
  if (
    count(database, "files") !== expectedFiles ||
    count(database, "nodes") !== graph.nodes.length ||
    count(database, "edges") !== graph.edges.length ||
    count(database, "diagnostics") !== graph.diagnostics.length ||
    count(database, "node_search") !== graph.nodes.length
  ) {
    throw new Error("Persisted graph counts do not match the normalized graph.");
  }
  const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length !== 0) {
    throw new Error("Persisted graph contains foreign-key violations.");
  }
  const quickCheck = database.prepare("PRAGMA quick_check").get() as
    | { quick_check: string }
    | undefined;
  if (quickCheck?.quick_check !== "ok") {
    throw new Error("Persisted graph failed SQLite integrity validation.");
  }
}

function readMetadata(database: DatabaseSync): IndexMetadata {
  const metadata: Record<string, unknown> = {};
  const rows = database.prepare(
    "SELECT key, value FROM metadata ORDER BY key",
  ).all() as Array<{ key: string; value: string }>;
  for (const row of rows) metadata[row.key] = JSON.parse(row.value) as unknown;
  if (!validMetadata(metadata)) throw new Error("Invalid index metadata.");
  return metadata;
}

function validateExistingDatabase(database: DatabaseSync): void {
  for (const table of ["files", "nodes", "edges", "diagnostics"]) {
    count(database, table);
  }
  if (count(database, "node_search") !== count(database, "nodes")) {
    throw new Error("Index search data is incomplete.");
  }
  const invalidSearchLink = database.prepare(`
    SELECT 1 AS invalid
    WHERE EXISTS (
      SELECT nodes.id
      FROM nodes
      LEFT JOIN node_search ON node_search.node_id = nodes.id
      GROUP BY nodes.id
      HAVING count(node_search.rowid) <> 1
    ) OR EXISTS (
      SELECT 1
      FROM node_search
      LEFT JOIN nodes ON nodes.id = node_search.node_id
      WHERE nodes.id IS NULL
    ) OR EXISTS (
      SELECT 1
      FROM node_search
      JOIN nodes ON nodes.id = node_search.node_id
      WHERE node_search.label IS NOT nodes.label
         OR node_search.qualified_name IS NOT nodes.qualified_name
         OR node_search.summary IS NOT nodes.summary
         OR node_search.source_file IS NOT nodes.source_file
    )
  `).get();
  if (invalidSearchLink !== undefined) {
    throw new Error("Index search data does not match indexed nodes.");
  }
  if (database.prepare("PRAGMA foreign_key_check").all().length !== 0) {
    throw new Error("Index foreign keys are invalid.");
  }
  const quickCheck = database.prepare("PRAGMA quick_check").get() as
    | { quick_check: string }
    | undefined;
  if (quickCheck?.quick_check !== "ok") {
    throw new Error("Index integrity validation failed.");
  }
}

function graphNodeFromRow(row: Record<string, unknown>): GraphNode {
  return {
    id: String(row.id),
    kind: String(row.kind) as GraphNode["kind"],
    label: String(row.label),
    qualifiedName: String(row.qualified_name),
    sourceFile: String(row.source_file),
    startLine: Number(row.start_line),
    startColumn: Number(row.start_column),
    endLine: Number(row.end_line),
    endColumn: Number(row.end_column),
    packageName: row.package_name === null ? null : String(row.package_name),
    projectPath: String(row.project_path),
    exported: Number(row.exported) === 1,
    signature: String(row.signature),
    summary: String(row.summary),
  };
}

function graphEdgeFromRow(row: Record<string, unknown>): GraphEdge {
  const diagnostic = row.diagnostic_code === null
    ? undefined
    : {
      code: String(row.diagnostic_code),
      level: String(row.diagnostic_level) as Diagnostic["level"],
      message: String(row.diagnostic_message),
      ...(row.diagnostic_file === null
        ? {}
        : { file: String(row.diagnostic_file) }),
    };
  return {
    source: String(row.source_id),
    target: String(row.target_id),
    kind: String(row.kind) as GraphEdge["kind"],
    confidence: String(row.confidence) as GraphEdge["confidence"],
    evidence: {
      file: String(row.evidence_file),
      startLine: Number(row.start_line),
      startColumn: Number(row.start_column),
      endLine: Number(row.end_line),
      endColumn: Number(row.end_column),
    },
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

function readStoredPaths(database: DatabaseSync): StoredPath[] {
  const paths: StoredPath[] = [];
  const add = (
    source: StoredPath["source"],
    id: StoredPath["id"],
    field: StoredPath["field"],
    value: unknown,
  ): void => {
    if (typeof value === "string") paths.push({ source, id, field, value });
  };
  const files = database.prepare(
    "SELECT rowid AS id, path, project_path FROM files ORDER BY rowid",
  ).all() as Array<Record<string, unknown>>;
  for (const row of files) {
    add("file", Number(row.id), "path", row.path);
    add("file", Number(row.id), "projectPath", row.project_path);
  }
  const nodes = database.prepare(
    "SELECT id, source_file, project_path FROM nodes ORDER BY id",
  ).all() as Array<Record<string, unknown>>;
  for (const row of nodes) {
    add("node", String(row.id), "sourceFile", row.source_file);
    add("node", String(row.id), "projectPath", row.project_path);
  }
  const edges = database.prepare(
    "SELECT id, evidence_file, diagnostic_file FROM edges ORDER BY id",
  ).all() as Array<Record<string, unknown>>;
  for (const row of edges) {
    add("edge", Number(row.id), "evidence", row.evidence_file);
    add("edge", Number(row.id), "diagnostic", row.diagnostic_file);
  }
  const diagnostics = database.prepare(
    "SELECT id, file FROM diagnostics ORDER BY id",
  ).all() as Array<Record<string, unknown>>;
  for (const row of diagnostics) {
    add("diagnostic", Number(row.id), "file", row.file);
  }
  return paths;
}

export class GraphDatabase {
  private indexPath: string | undefined;

  async openExisting(repo: LocalRepository): Promise<Result<void>> {
    const repository = { ...repo };
    this.indexPath = undefined;
    const existing = await existingIndexPath(repository);
    if (!existing.ok) return existing;
    const indexPath = existing.value;
    let database: DatabaseSync | undefined;
    try {
      database = openDatabase(indexPath, true);
      const metadata = readMetadata(database);
      if (metadata.schemaVersion !== SCHEMA_VERSION) {
        database.close();
        database = undefined;
        return unavailableFailure(
          "INCOMPATIBLE_INDEX",
          "The repository graph index uses an incompatible schema; rebuild it with repo-graph index.",
        );
      }
      validateExistingDatabase(database);
      database.close();
      database = undefined;
    } catch {
      try {
        database?.close();
      } catch {
        // The unusable index diagnostic remains actionable.
      }
      return unavailableFailure(
        "UNUSABLE_INDEX",
        "The repository graph index is corrupt or incomplete; rebuild it with repo-graph index.",
      );
    }
    this.indexPath = indexPath;
    return { ok: true, value: undefined, diagnostics: [] };
  }

  /** Reads diagnostic evidence without accepting a corrupt index for queries. */
  async auditExisting(repo: LocalRepository): Promise<Result<DatabaseAudit>> {
    const existing = await existingIndexPath({ ...repo });
    if (!existing.ok) return existing;
    let database: DatabaseSync | undefined;
    try {
      database = openDatabase(existing.value, true);
      const metadata = readMetadata(database);
      if (metadata.schemaVersion !== SCHEMA_VERSION) {
        database.close();
        database = undefined;
        return unavailableFailure(
          "INCOMPATIBLE_INDEX",
          "The repository graph index uses an incompatible schema; rebuild it with repo-graph index.",
        );
      }
      const foreignKeyViolations = database.prepare(
        "PRAGMA foreign_key_check",
      ).all() as unknown as ForeignKeyViolation[];
      const value: DatabaseAudit = {
        foreignKeyViolations: foreignKeyViolations.sort(
          compareForeignKeyViolations,
        ),
        storedPaths: readStoredPaths(database),
      };
      database.close();
      database = undefined;
      return { ok: true, value, diagnostics: [] };
    } catch {
      try {
        database?.close();
      } catch {
        // The unusable index diagnostic remains actionable.
      }
      return unavailableFailure(
        "UNUSABLE_INDEX",
        "The repository graph index could not be audited safely; rebuild it with repo-graph index.",
      );
    }
  }

  async createAtomic(
    repo: LocalRepository,
    graph: NormalizedGraph,
    metadata: IndexMetadata,
  ): Promise<Result<void>> {
    const repository = { ...repo };
    const graphSnapshot = snapshotGraph(graph);
    const metadataSnapshot: unknown = { ...metadata };
    if (!safeRepository(repository)) {
      return invalidFailure(
        "INVALID_DATA_DIRECTORY",
        "The graph database must be stored in the repository-local .repo-graph directory.",
      );
    }
    if (!validMetadata(metadataSnapshot)) {
      return invalidFailure(
        "INVALID_METADATA",
        "Index metadata must use approved keys and their documented scalar types.",
      );
    }
    const validation = validateNormalizedGraph(graphSnapshot);
    if (!validation.ok) return validation;
    try {
      const root = await stat(repository.root);
      if (!root.isDirectory()) {
        return invalidFailure("LOCAL_DIRECTORY_REQUIRED", "Repository root must be a directory.");
      }
    } catch {
      return invalidFailure("LOCAL_PATH_NOT_FOUND", "Repository root could not be inspected.");
    }

    try {
      await mkdir(repository.dataDir, { recursive: true });
      const [canonicalRoot, canonicalDataDir] = await Promise.all([
        realpath(repository.root),
        realpath(repository.dataDir),
      ]);
      if (relative(canonicalRoot, canonicalDataDir) !== ".repo-graph") {
        return invalidFailure(
          "DATA_DIRECTORY_OUTSIDE_REPOSITORY",
          "The graph data directory must resolve inside the repository root.",
        );
      }
    } catch {
      return internalFailure(
        "DATA_DIRECTORY_FAILED",
        "The repository-local graph data directory could not be prepared.",
      );
    }
    const finalPath = join(repository.dataDir, "index.sqlite");
    const temporaryPath = join(
      repository.dataDir,
      `index.sqlite.tmp-${randomUUID()}`,
    );
    let database: DatabaseSync | undefined;
    let transactionOpen = false;
    try {
      database = openDatabase(temporaryPath, false);
      database.exec(SCHEMA_SQL);
      database.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      insertGraph(database, graphSnapshot, metadataSnapshot);
      database.exec("COMMIT");
      transactionOpen = false;
      validateWrittenDatabase(database, graphSnapshot);
      database.close();
      database = undefined;
      await rename(temporaryPath, finalPath);
      this.indexPath = finalPath;
      return { ok: true, value: undefined, diagnostics: [] };
    } catch {
      if (database !== undefined) {
        if (transactionOpen) {
          try {
            database.exec("ROLLBACK");
          } catch {
            // The original persistence failure is the actionable error.
          }
        }
        try {
          database.close();
        } catch {
          // Cleanup continues with the temporary file.
        }
      }
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      return internalFailure(
        "DATABASE_REPLACEMENT_FAILED",
        "The normalized graph could not be persisted; the previous index was preserved.",
      );
    }
  }

  private withReadOnly<T>(query: (database: DatabaseSync) => T): T {
    if (this.indexPath === undefined) {
      throw new Error("No graph database has been created by this instance.");
    }
    const database = openDatabase(this.indexPath, true);
    try {
      return query(database);
    } finally {
      database.close();
    }
  }

  async stats(): Promise<DatabaseStats> {
    return this.withReadOnly((database) => ({
      fileCount: count(database, "files"),
      nodeCount: count(database, "nodes"),
      edgeCount: count(database, "edges"),
      diagnosticCount: count(database, "diagnostics"),
    }));
  }

  async foreignKeyViolations(): Promise<ForeignKeyViolation[]> {
    return this.withReadOnly((database) => {
      const violations = database.prepare("PRAGMA foreign_key_check").all() as
        unknown as ForeignKeyViolation[];
      return violations.sort(compareForeignKeyViolations);
    });
  }

  async storedPaths(): Promise<StoredPath[]> {
    return this.withReadOnly(readStoredPaths);
  }

  async nodes(): Promise<GraphNode[]> {
    return this.withReadOnly((database) =>
      (database.prepare("SELECT * FROM nodes ORDER BY id").all() as Array<
        Record<string, unknown>
      >).map(graphNodeFromRow)
    );
  }

  async edges(): Promise<GraphEdge[]> {
    return this.withReadOnly((database) =>
      (database.prepare("SELECT * FROM edges ORDER BY id").all() as Array<
        Record<string, unknown>
      >).map(graphEdgeFromRow)
    );
  }

  async metadata(): Promise<Record<string, string | number | boolean | null>> {
    return this.withReadOnly((database) => {
      const output: Record<string, string | number | boolean | null> = {};
      const rows = database.prepare(
        "SELECT key, value FROM metadata ORDER BY key",
      ).all() as Array<{ key: string; value: string }>;
      for (const row of rows) {
        output[row.key] = JSON.parse(row.value) as
          | string
          | number
          | boolean
          | null;
      }
      return output;
    });
  }

  async searchNodes(query: string, limit: number): Promise<GraphNode[]> {
    const terms = query.match(/[\p{L}\p{N}_$.-]+/gu) ?? [];
    if (terms.length === 0 || !Number.isInteger(limit) || limit < 1) return [];
    const boundedLimit = Math.min(limit, 100);
    const expression = terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" AND ");
    return this.withReadOnly((database) =>
      (database.prepare(`
        SELECT nodes.*
        FROM node_search
        JOIN nodes ON nodes.id = node_search.node_id
        WHERE node_search MATCH ?
        ORDER BY bm25(node_search), nodes.id
        LIMIT ?
      `).all(expression, boundedLimit) as Array<Record<string, unknown>>)
        .map(graphNodeFromRow)
    );
  }
}
