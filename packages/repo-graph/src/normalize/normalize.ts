import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";

import {
  ExitCode,
  redactDiagnostic,
  type Diagnostic,
  type Result,
} from "../domain/diagnostic.js";
import type {
  Confidence,
  EdgeKind,
  GraphEdge,
  GraphFragment,
  GraphNode,
  NodeKind,
} from "../domain/graph.js";

export interface NormalizedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  diagnostics: Diagnostic[];
}

const NODE_KINDS: ReadonlySet<string> = new Set<NodeKind>([
  "repository",
  "package",
  "project",
  "file",
  "class",
  "interface",
  "type_alias",
  "enum",
  "function",
  "method",
  "constructor",
  "variable",
  "constant",
  "property",
  "test",
  "external_module",
  "unresolved_symbol",
]);

const EDGE_KINDS: ReadonlySet<string> = new Set<EdgeKind>([
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
  "configured_by",
]);

const CONFIDENCES: ReadonlySet<string> = new Set<Confidence>([
  "resolved",
  "syntactic",
  "heuristic",
]);

const GRAPH_NODE_FIELDS: ReadonlySet<string> = new Set<keyof GraphNode>([
  "id",
  "kind",
  "label",
  "qualifiedName",
  "sourceFile",
  "startLine",
  "startColumn",
  "endLine",
  "endColumn",
  "packageName",
  "projectPath",
  "exported",
  "signature",
  "summary",
]);

const SOURCE_BODY_KEY = /^(?:body|source_?body|source_?code|source_?text|file_?contents?)$/iu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const WINDOWS_DRIVE_PREFIX = /^[a-z]:/iu;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function failure<T>(code: string, message: string): Result<T> {
  return {
    ok: false,
    exitCode: ExitCode.InvalidInput,
    diagnostics: [{ code, level: "error", message }],
  };
}

function containsSourceBody(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (SOURCE_BODY_KEY.test(key)) return true;
    if (containsSourceBody(nested, seen)) return true;
  }
  return false;
}

function hasOnlyGraphNodeFields(node: GraphNode): boolean {
  return Object.keys(node).every((key) => GRAPH_NODE_FIELDS.has(key));
}

function normalizePath(
  value: string,
  allowEmpty: boolean,
): { ok: true; value: string } | { ok: false; absolute: boolean } {
  if (value === "" && allowEmpty) return { ok: true, value };
  const absolute = posix.isAbsolute(value) || win32.isAbsolute(value);
  if (
    value === "" ||
    CONTROL_CHARACTER.test(value) ||
    absolute ||
    WINDOWS_DRIVE_PREFIX.test(value)
  ) {
    return { ok: false, absolute };
  }
  const normalized = posix.normalize(value.replaceAll("\\", "/"));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    return { ok: false, absolute: false };
  }
  return { ok: true, value: normalized };
}

function validLocation(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): boolean {
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(startColumn) ||
    !Number.isInteger(endLine) ||
    !Number.isInteger(endColumn) ||
    startLine < 1 ||
    startColumn < 1 ||
    endLine < startLine ||
    endColumn < 1
  ) {
    return false;
  }
  return endLine !== startLine || endColumn >= startColumn;
}

function nodeIdentity(node: GraphNode): string {
  return [
    node.sourceFile,
    node.kind,
    node.qualifiedName,
    node.startLine,
    node.startColumn,
    node.endLine,
    node.endColumn,
  ].join("\0");
}

function nodeContentKey(node: GraphNode): string {
  return [
    node.kind,
    node.label,
    node.qualifiedName,
    node.sourceFile,
    node.startLine,
    node.startColumn,
    node.endLine,
    node.endColumn,
    node.packageName ?? "",
    node.projectPath,
    node.exported ? "1" : "0",
    node.signature,
    node.summary,
  ].join("\0");
}

function normalizedId(identity: string): string {
  return createHash("sha256").update(`node\0${identity}`).digest("hex");
}

function compareNodes(left: GraphNode, right: GraphNode): number {
  return compareText(left.id, right.id);
}

function diagnosticKey(diagnostic: Diagnostic): string {
  return [
    diagnostic.file ?? "",
    diagnostic.code,
    diagnostic.level,
    diagnostic.message,
  ].join("\0");
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return compareText(diagnosticKey(left), diagnosticKey(right));
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
    edge.diagnostic === undefined ? "" : diagnosticKey(edge.diagnostic),
  ].join("\0");
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return compareText(edgeKey(left), edgeKey(right));
}

function normalizeDiagnostic(
  diagnostic: Diagnostic,
): Result<Diagnostic> {
  if (diagnostic.file === undefined) {
    return { ok: true, value: redactDiagnostic(diagnostic), diagnostics: [] };
  }
  const file = normalizePath(diagnostic.file, false);
  if (!file.ok) {
    return failure(
      file.absolute ? "ABSOLUTE_SOURCE_PATH" : "INVALID_SOURCE_PATH",
      "Diagnostic paths must be repository-relative paths.",
    );
  }
  return {
    ok: true,
    value: { ...redactDiagnostic(diagnostic), file: file.value },
    diagnostics: [],
  };
}

export function validateNormalizedGraph(
  graph: NormalizedGraph,
): Result<void> {
  if (containsSourceBody(graph)) {
    return failure(
      "SOURCE_BODY_FORBIDDEN",
      "Normalized graphs must not contain complete source bodies.",
    );
  }
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!hasOnlyGraphNodeFields(node)) {
      return failure(
        "UNKNOWN_NODE_FIELD",
        "Graph nodes must contain only approved GraphNode fields.",
      );
    }
    if (!NODE_KINDS.has(node.kind)) {
      return failure("UNKNOWN_NODE_KIND", `Unknown node kind: ${String(node.kind)}.`);
    }
    const sourceFile = normalizePath(node.sourceFile, false);
    const projectPath = normalizePath(node.projectPath, true);
    if (!sourceFile.ok || !projectPath.ok) {
      const absolute = (!sourceFile.ok && sourceFile.absolute) ||
        (!projectPath.ok && projectPath.absolute);
      return failure(
        absolute ? "ABSOLUTE_SOURCE_PATH" : "INVALID_SOURCE_PATH",
        "Node paths must be repository-relative paths.",
      );
    }
    if (!validLocation(
      node.startLine,
      node.startColumn,
      node.endLine,
      node.endColumn,
    )) {
      return failure("INVALID_SOURCE_LOCATION", "Node source locations must be valid.");
    }
    if (nodeIds.has(node.id)) {
      return failure("DUPLICATE_NODE_ID", `Duplicate normalized node ID: ${node.id}.`);
    }
    nodeIds.add(node.id);
  }
  for (const edge of graph.edges) {
    if (!EDGE_KINDS.has(edge.kind)) {
      return failure("UNKNOWN_EDGE_KIND", `Unknown edge kind: ${String(edge.kind)}.`);
    }
    if (!CONFIDENCES.has(edge.confidence)) {
      return failure(
        "UNKNOWN_CONFIDENCE",
        `Unknown edge confidence: ${String(edge.confidence)}.`,
      );
    }
    const evidenceFile = normalizePath(edge.evidence.file, false);
    if (!evidenceFile.ok) {
      return failure(
        evidenceFile.absolute ? "ABSOLUTE_SOURCE_PATH" : "INVALID_SOURCE_PATH",
        "Edge evidence paths must be repository-relative paths.",
      );
    }
    if (!validLocation(
      edge.evidence.startLine,
      edge.evidence.startColumn,
      edge.evidence.endLine,
      edge.evidence.endColumn,
    )) {
      return failure("INVALID_SOURCE_LOCATION", "Edge evidence locations must be valid.");
    }
    if (edge.diagnostic !== undefined) {
      const normalized = normalizeDiagnostic(edge.diagnostic);
      if (!normalized.ok) return normalized;
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return failure(
        "DANGLING_EDGE",
        `Edge ${edge.kind} has an endpoint that is not present in the graph.`,
      );
    }
  }
  for (const diagnostic of graph.diagnostics) {
    const normalized = normalizeDiagnostic(diagnostic);
    if (!normalized.ok) return normalized;
  }
  return { ok: true, value: undefined, diagnostics: [] };
}

export function normalizeGraph(
  fragments: readonly GraphFragment[],
): Result<NormalizedGraph> {
  if (containsSourceBody(fragments)) {
    return failure(
      "SOURCE_BODY_FORBIDDEN",
      "Graph fragments must not contain complete source bodies.",
    );
  }

  const oldToNormalizedId = new Map<string, string>();
  const normalizedByIdentity = new Map<string, GraphNode>();
  for (const fragment of fragments) {
    const ownerFile = normalizePath(fragment.ownerFile, false);
    if (!ownerFile.ok) {
      return failure(
        ownerFile.absolute ? "ABSOLUTE_SOURCE_PATH" : "INVALID_SOURCE_PATH",
        "Fragment owner paths must be repository-relative paths.",
      );
    }
    for (const original of fragment.nodes) {
      if (!hasOnlyGraphNodeFields(original)) {
        return failure(
          "UNKNOWN_NODE_FIELD",
          "Graph nodes must contain only approved GraphNode fields.",
        );
      }
      if (!NODE_KINDS.has(original.kind)) {
        return failure(
          "UNKNOWN_NODE_KIND",
          `Unknown node kind: ${String(original.kind)}.`,
        );
      }
      const sourceFile = normalizePath(original.sourceFile, false);
      const projectPath = normalizePath(original.projectPath, true);
      if (!sourceFile.ok || !projectPath.ok) {
        const absolute = (!sourceFile.ok && sourceFile.absolute) ||
          (!projectPath.ok && projectPath.absolute);
        return failure(
          absolute ? "ABSOLUTE_SOURCE_PATH" : "INVALID_SOURCE_PATH",
          "Node paths must be repository-relative paths.",
        );
      }
      if (!validLocation(
        original.startLine,
        original.startColumn,
        original.endLine,
        original.endColumn,
      )) {
        return failure("INVALID_SOURCE_LOCATION", "Node source locations must be valid.");
      }
      const normalizedNode: GraphNode = {
        id: original.id,
        kind: original.kind,
        label: original.label,
        qualifiedName: original.qualifiedName,
        sourceFile: sourceFile.value,
        startLine: original.startLine,
        startColumn: original.startColumn,
        endLine: original.endLine,
        endColumn: original.endColumn,
        packageName: original.packageName,
        projectPath: projectPath.value,
        exported: original.exported,
        signature: original.signature,
        summary: original.summary,
      };
      const identity = nodeIdentity(normalizedNode);
      normalizedNode.id = normalizedId(identity);
      const previousMapping = oldToNormalizedId.get(original.id);
      if (previousMapping !== undefined && previousMapping !== normalizedNode.id) {
        return failure(
          "CONFLICTING_NODE_ID",
          `Provisional node ID ${original.id} identifies multiple declarations.`,
        );
      }
      oldToNormalizedId.set(original.id, normalizedNode.id);
      const existing = normalizedByIdentity.get(identity);
      if (existing !== undefined) {
        if (nodeContentKey(existing) !== nodeContentKey(normalizedNode)) {
          return failure(
            "CONFLICTING_NODE_IDENTITY",
            `Declaration ${original.qualifiedName} has conflicting node records.`,
          );
        }
      } else {
        normalizedByIdentity.set(identity, normalizedNode);
      }
    }
  }

  const nodes = [...normalizedByIdentity.values()].sort(compareNodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgesByKey = new Map<string, GraphEdge>();
  const diagnosticsByKey = new Map<string, Diagnostic>();

  for (const fragment of fragments) {
    for (const original of fragment.edges) {
      if (!EDGE_KINDS.has(original.kind)) {
        return failure(
          "UNKNOWN_EDGE_KIND",
          `Unknown edge kind: ${String(original.kind)}.`,
        );
      }
      if (!CONFIDENCES.has(original.confidence)) {
        return failure(
          "UNKNOWN_CONFIDENCE",
          `Unknown edge confidence: ${String(original.confidence)}.`,
        );
      }
      const evidenceFile = normalizePath(original.evidence.file, false);
      if (!evidenceFile.ok) {
        return failure(
          evidenceFile.absolute ? "ABSOLUTE_SOURCE_PATH" : "INVALID_SOURCE_PATH",
          "Edge evidence paths must be repository-relative paths.",
        );
      }
      if (!validLocation(
        original.evidence.startLine,
        original.evidence.startColumn,
        original.evidence.endLine,
        original.evidence.endColumn,
      )) {
        return failure("INVALID_SOURCE_LOCATION", "Edge evidence locations must be valid.");
      }
      const source = oldToNormalizedId.get(original.source);
      const target = oldToNormalizedId.get(original.target);
      if (
        source === undefined ||
        target === undefined ||
        !nodeIds.has(source) ||
        !nodeIds.has(target)
      ) {
        return failure(
          "DANGLING_EDGE",
          `Edge ${original.kind} has an endpoint that is not present in the graph.`,
        );
      }
      let diagnostic: Diagnostic | undefined;
      if (original.diagnostic !== undefined) {
        const normalized = normalizeDiagnostic(original.diagnostic);
        if (!normalized.ok) return normalized;
        diagnostic = normalized.value;
        diagnosticsByKey.set(diagnosticKey(diagnostic), diagnostic);
      }
      const normalizedEdge: GraphEdge = {
        source,
        target,
        kind: original.kind,
        confidence: original.confidence,
        evidence: { ...original.evidence, file: evidenceFile.value },
        ...(diagnostic === undefined ? {} : { diagnostic }),
      };
      edgesByKey.set(edgeKey(normalizedEdge), normalizedEdge);
    }
    for (const original of fragment.diagnostics) {
      const normalized = normalizeDiagnostic(original);
      if (!normalized.ok) return normalized;
      diagnosticsByKey.set(diagnosticKey(normalized.value), normalized.value);
    }
  }

  const graph: NormalizedGraph = {
    nodes,
    edges: [...edgesByKey.values()].sort(compareEdges),
    diagnostics: [...diagnosticsByKey.values()].sort(compareDiagnostics),
  };
  const validation = validateNormalizedGraph(graph);
  if (!validation.ok) return validation;
  return { ok: true, value: graph, diagnostics: graph.diagnostics };
}
