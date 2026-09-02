import assert from "node:assert/strict";
import test from "node:test";

import { ExitCode } from "../src/domain/diagnostic.js";
import type {
  GraphEdge,
  GraphFragment,
  GraphNode,
} from "../src/domain/graph.js";
import { normalizeGraph } from "../src/normalize/normalize.js";

function node(
  id: string,
  kind: GraphNode["kind"],
  qualifiedName: string,
  sourceFile: string,
  startLine = 1,
): GraphNode {
  return {
    id,
    kind,
    label: qualifiedName.split(".").at(-1) ?? qualifiedName,
    qualifiedName,
    sourceFile,
    startLine,
    startColumn: 1,
    endLine: startLine,
    endColumn: 10,
    packageName: "@fixture/app",
    projectPath: "tsconfig.json",
    exported: kind === "class",
    signature: kind === "class" ? "typeof UserService" : "",
    summary: "",
  };
}

function edge(
  source: string,
  target: string,
  kind: GraphEdge["kind"],
  file: string,
): GraphEdge {
  return {
    source,
    target,
    kind,
    confidence: "resolved",
    evidence: {
      file,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 20,
    },
  };
}

function barrelFragments(): GraphFragment[] {
  const barrel = node("barrel-file", "file", "src/index.ts", "src/index.ts");
  const serviceFile = node(
    "service-file",
    "file",
    "src/user-service.ts",
    "src/user-service.ts",
  );
  const canonical = node(
    "canonical-service",
    "class",
    "UserService",
    "src/user-service.ts",
    3,
  );
  const aliasView = { ...canonical, id: "barrel-alias-service" };
  const reExport = edge(
    barrel.id,
    aliasView.id,
    "re_exports",
    "src/index.ts",
  );

  return [
    {
      ownerFile: "src/index.ts",
      nodes: [barrel, aliasView],
      edges: [reExport, reExport],
      diagnostics: [],
    },
    {
      ownerFile: "src/user-service.ts",
      nodes: [serviceFile, canonical],
      edges: [
        edge(serviceFile.id, canonical.id, "declares", "src/user-service.ts"),
      ],
      diagnostics: [],
    },
  ];
}

test("canonicalizes barrel aliases without losing re-export evidence", () => {
  const result = normalizeGraph(barrelFragments());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.value.nodes.filter((item) => item.qualifiedName === "UserService")
      .length,
    1,
  );
  assert.equal(
    result.value.edges.filter((item) => item.kind === "re_exports").length,
    1,
  );
  assert.ok(result.value.edges.every((item) =>
    result.value.nodes.some((candidate) => candidate.id === item.target)
  ));
});

test("normalization is independent of fragment, node, and edge insertion order", () => {
  const fragments = barrelFragments();
  const reordered = [...fragments].reverse().map((fragment) => ({
    ...fragment,
    nodes: [...fragment.nodes].reverse(),
    edges: [...fragment.edges].reverse(),
  }));

  assert.deepEqual(normalizeGraph(fragments), normalizeGraph(reordered));
});

test("rejects unknown GraphNode fields regardless of insertion order", () => {
  for (const extraFields of [
    { extensionData: "first", futureField: 1 },
    { futureField: 1, extensionData: "first" },
  ]) {
    const fragments = barrelFragments();
    Object.assign(fragments[0]?.nodes[0] ?? {}, extraFields);

    const result = normalizeGraph(fragments);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.diagnostics.some((item) =>
        item.code === "UNKNOWN_NODE_FIELD"
      ));
    }
  }
});

test("rejects Windows drive-relative paths in every graph path slot", () => {
  const cases: Array<(fragments: GraphFragment[]) => void> = [
    (fragments) => {
      fragments[0]!.ownerFile = "C:relative.ts";
    },
    (fragments) => {
      fragments[0]!.nodes[0]!.sourceFile = "C:relative.ts";
    },
    (fragments) => {
      fragments[0]!.nodes[0]!.projectPath = "C:relative.ts";
    },
    (fragments) => {
      fragments[0]!.edges[0]!.evidence.file = "C:relative.ts";
    },
    (fragments) => {
      fragments[0]!.diagnostics.push({
        code: "UNSAFE_PATH",
        level: "warning",
        message: "Unsafe path fixture.",
        file: "C:relative.ts",
      });
    },
    (fragments) => {
      fragments[0]!.edges[0]!.diagnostic = {
        code: "UNSAFE_EDGE_PATH",
        level: "warning",
        message: "Unsafe edge path fixture.",
        file: "C:relative.ts",
      };
    },
  ];

  for (const mutate of cases) {
    const fragments = barrelFragments();
    mutate(fragments);

    const result = normalizeGraph(fragments);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.diagnostics.some((item) =>
        item.code === "INVALID_SOURCE_PATH"
      ));
    }
  }
});

test("rejects dangling endpoints after canonicalizing aliases", () => {
  const fragments = barrelFragments();
  fragments[0]?.edges.push(
    edge("barrel-file", "missing-node", "re_exports", "src/index.ts"),
  );

  const result = normalizeGraph(fragments);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.exitCode, ExitCode.InvalidInput);
  assert.ok(result.diagnostics.some((item) => item.code === "DANGLING_EDGE"));
});

test("rejects unknown kinds, absolute paths, and source bodies", () => {
  const unknownKind = barrelFragments();
  Object.assign(unknownKind[0]?.nodes[0] ?? {}, { kind: "namespace" });
  const absolutePath = barrelFragments();
  Object.assign(absolutePath[0]?.nodes[0] ?? {}, {
    sourceFile: "/private/source.ts",
  });
  const sourceBody = barrelFragments();
  Object.assign(sourceBody[0]?.nodes[0] ?? {}, {
    sourceBody: "export const credential = 'secret'",
  });

  for (const [fragments, code] of [
    [unknownKind, "UNKNOWN_NODE_KIND"],
    [absolutePath, "ABSOLUTE_SOURCE_PATH"],
    [sourceBody, "SOURCE_BODY_FORBIDDEN"],
  ] as const) {
    const result = normalizeGraph(fragments);
    assert.equal(result.ok, false, code);
    if (!result.ok) {
      assert.ok(result.diagnostics.some((item) => item.code === code), code);
    }
  }
});
