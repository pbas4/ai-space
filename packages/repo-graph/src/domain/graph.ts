import type { Diagnostic } from "./diagnostic.js";

export type NodeKind =
  | "repository"
  | "package"
  | "project"
  | "file"
  | "class"
  | "interface"
  | "type_alias"
  | "enum"
  | "function"
  | "method"
  | "constructor"
  | "variable"
  | "constant"
  | "property"
  | "test"
  | "external_module"
  | "unresolved_symbol";

export type EdgeKind =
  | "contains"
  | "declares"
  | "imports"
  | "dynamically_imports"
  | "exports"
  | "re_exports"
  | "calls"
  | "references"
  | "extends"
  | "implements"
  | "overrides"
  | "instantiates"
  | "tests"
  | "configured_by";

export type Confidence = "resolved" | "syntactic" | "heuristic";

export interface Evidence {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  qualifiedName: string;
  sourceFile: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  packageName: string | null;
  projectPath: string;
  exported: boolean;
  signature: string;
  summary: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  confidence: Confidence;
  evidence: Evidence;
  diagnostic?: Diagnostic;
}

export interface GraphFragment {
  ownerFile: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  diagnostics: Diagnostic[];
}
