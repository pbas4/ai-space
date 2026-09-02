import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createPrograms } from "../src/compiler/create-programs.js";
import { loadCompiler } from "../src/compiler/load-compiler.js";
import { discoverRepository } from "../src/discovery/discover.js";
import type {
  Confidence,
  EdgeKind,
  GraphFragment,
  GraphNode,
} from "../src/domain/graph.js";
import { extractNodes } from "../src/extract/nodes.js";
import { extractRelations } from "../src/extract/relations.js";
import { resolveLocalRepository } from "../src/local/path-policy.js";

const fixtureRoot = resolve("test/fixtures/relations");

function allNodes(fragments: readonly GraphFragment[]): GraphNode[] {
  return fragments.flatMap((fragment) => fragment.nodes);
}

function assertEdge(
  fragments: readonly GraphFragment[],
  kind: EdgeKind,
  sourceName: string,
  targetName: string,
  confidence: Confidence,
): void {
  const nodes = allNodes(fragments);
  const namesById = new Map(
    nodes.map((node) => [node.id, node.qualifiedName] as const),
  );
  assert.ok(
    fragments.some((fragment) =>
      fragment.edges.some(
        (edge) =>
          edge.kind === kind &&
          edge.confidence === confidence &&
          namesById.get(edge.source) === sourceName &&
          namesById.get(edge.target) === targetName,
      )
    ),
    `missing ${confidence} ${kind} edge ${sourceName} -> ${targetName}`,
  );
}

test("extracts every evidence-bearing relationship kind conservatively", async () => {
  const repository = await resolveLocalRepository(fixtureRoot, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const discovery = await discoverRepository(repository.value);
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;
  const compiler = await loadCompiler(fixtureRoot);
  assert.equal(compiler.ok, true);
  if (!compiler.ok) return;
  const programs = await createPrograms(compiler.value, discovery.value);
  assert.equal(programs.ok, true);
  if (!programs.ok) return;
  const project = programs.value[0];
  assert.ok(project);
  const declarations = extractNodes(project, fixtureRoot);
  const inputSnapshot = JSON.stringify(declarations);

  const fragments = extractRelations(project, declarations, fixtureRoot);
  const edges = fragments.flatMap((fragment) => fragment.edges);
  const nodes = allNodes(fragments);
  const nodeIds = new Set(nodes.map((node) => node.id));

  assert.deepEqual(
    fragments.map((fragment) => fragment.ownerFile),
    [
      "src/base.ts",
      "src/empty.ts",
      "src/index.test.ts",
      "src/index.ts",
      "src/unsupported.ts",
    ],
  );
  assert.equal(JSON.stringify(declarations), inputSnapshot);
  assert.ok(
    fragments.every(
      (fragment, index) =>
        fragment !== declarations[index] &&
        fragment.nodes !== declarations[index]?.nodes &&
        fragment.edges !== declarations[index]?.edges,
    ),
  );

  assertEdge(fragments, "contains", "Service", "Service.run", "syntactic");
  assertEdge(fragments, "declares", "src/index.ts", "Service", "syntactic");
  assertEdge(
    fragments,
    "declares",
    "src/index.test.ts",
    "service runs",
    "syntactic",
  );
  assertEdge(fragments, "imports", "src/index.ts", "src/base.ts", "resolved");
  assertEdge(
    fragments,
    "dynamically_imports",
    "src/index.ts",
    "src/base.ts",
    "resolved",
  );
  assertEdge(fragments, "exports", "src/index.ts", "Service", "resolved");
  assertEdge(
    fragments,
    "exports",
    "src/index.ts",
    "DefaultService",
    "resolved",
  );
  assertEdge(fragments, "re_exports", "src/index.ts", "BaseService", "resolved");
  assertEdge(
    fragments,
    "re_exports",
    "src/index.ts",
    "src/base.ts",
    "resolved",
  );
  assertEdge(
    fragments,
    "re_exports",
    "src/index.ts",
    "src/empty.ts",
    "resolved",
  );
  assertEdge(
    fragments,
    "re_exports",
    "src/index.ts",
    "src/unsupported.ts",
    "resolved",
  );
  assertEdge(
    fragments,
    "re_exports",
    "src/index.ts",
    "external-package",
    "syntactic",
  );
  assertEdge(
    fragments,
    "re_exports",
    "src/index.ts",
    "missing-reexport",
    "syntactic",
  );
  assertEdge(
    fragments,
    "calls",
    "Service.run",
    "BaseService.validate",
    "resolved",
  );
  assertEdge(fragments, "references", "Service", "Validator", "resolved");
  assertEdge(fragments, "extends", "Service", "BaseService", "resolved");
  assertEdge(fragments, "implements", "Service", "Validator", "resolved");
  assertEdge(
    fragments,
    "overrides",
    "Service.validate",
    "BaseService.validate",
    "resolved",
  );
  assertEdge(
    fragments,
    "instantiates",
    "Service.run",
    "BaseService",
    "resolved",
  );
  assertEdge(
    fragments,
    "instantiates",
    "makeAliasedService",
    "ConstructedService",
    "resolved",
  );
  assertEdge(
    fragments,
    "tests",
    "src/index.test.ts",
    "Service.run",
    "heuristic",
  );
  assertEdge(
    fragments,
    "configured_by",
    "src/index.ts",
    "tsconfig.json",
    "syntactic",
  );
  assertEdge(
    fragments,
    "imports",
    "src/index.ts",
    "missing-package",
    "syntactic",
  );

  const dynamicCall = edges.find(
    (edge) =>
      edge.kind === "calls" &&
      edge.evidence.file === "src/index.ts" &&
      nodes.find((node) => node.id === edge.source)?.qualifiedName ===
        "callComputed" &&
      nodes.find((node) => node.id === edge.target)?.kind ===
        "unresolved_symbol",
  );
  assert.ok(dynamicCall);
  assert.notEqual(dynamicCall.confidence, "resolved");
  assert.equal(nodes.find((node) => node.id === dynamicCall.target)?.kind, "unresolved_symbol");

  assert.ok(
    nodes.some(
      (node) =>
        node.kind === "external_module" &&
        node.qualifiedName === "missing-package" &&
        node.sourceFile === "src/index.ts",
    ),
  );
  assert.ok(
    !nodes.some(
      (node) =>
        node.kind === "external_module" &&
        (node.qualifiedName === "./empty.js" ||
          node.qualifiedName === "./unsupported.js"),
    ),
  );
  assert.ok(
    nodes.some(
      (node) =>
        node.kind === "unresolved_symbol" && node.sourceFile === "src/index.ts",
    ),
  );
  const namesById = new Map(
    nodes.map((node) => [node.id, node.qualifiedName] as const),
  );
  assert.ok(
    !edges.some(
      (edge) =>
        edge.kind === "tests" && namesById.get(edge.target) === "localHelper",
    ),
  );
  assert.ok(edges.length > 0);
  assert.ok(
    edges.every(
      (edge) =>
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        edge.evidence.file.length > 0 &&
        !edge.evidence.file.startsWith("/") &&
        edge.evidence.startLine > 0 &&
        edge.evidence.startColumn > 0 &&
        edge.evidence.endLine >= edge.evidence.startLine &&
        edge.evidence.endColumn > 0,
    ),
  );
});

test("marks a direct export resolved only when the checker confirms its declaration", async () => {
  const repository = await resolveLocalRepository(fixtureRoot, process.cwd());
  assert.equal(repository.ok, true);
  if (!repository.ok) return;
  const discovery = await discoverRepository(repository.value);
  assert.equal(discovery.ok, true);
  if (!discovery.ok) return;
  const compiler = await loadCompiler(fixtureRoot);
  assert.equal(compiler.ok, true);
  if (!compiler.ok) return;
  const programs = await createPrograms(compiler.value, discovery.value);
  assert.equal(programs.ok, true);
  if (!programs.ok) return;
  const project = programs.value[0];
  assert.ok(project);
  const declarations = extractNodes(project, fixtureRoot);
  const checker = new Proxy(project.checker, {
    get(target, property) {
      if (property === "getSymbolAtLocation") {
        return (
          node: Parameters<typeof target.getSymbolAtLocation>[0],
        ): ReturnType<typeof target.getSymbolAtLocation> => {
          if (
            node.getText() === "Service" &&
            node.parent.getText().startsWith("export class Service")
          ) {
            return undefined;
          }
          return target.getSymbolAtLocation(node);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  const fragments = extractRelations(
    { ...project, checker },
    declarations,
    fixtureRoot,
  );

  assertEdge(fragments, "exports", "src/index.ts", "Service", "syntactic");
});
