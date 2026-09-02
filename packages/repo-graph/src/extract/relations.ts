import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";

import * as ts from "typescript";

import type { ProjectProgram } from "../compiler/create-programs.js";
import type {
  Confidence,
  EdgeKind,
  Evidence,
  GraphEdge,
  GraphFragment,
  GraphNode,
  NodeKind,
} from "../domain/graph.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function repositoryRelativePath(
  repositoryRoot: string,
  fileName: string,
): string | undefined {
  const candidate = relative(repositoryRoot, fileName);
  if (
    candidate === ".." ||
    candidate.startsWith(`..${sep}`) ||
    isAbsolute(candidate)
  ) {
    return undefined;
  }
  return candidate.split("\\").join("/");
}

function configuredProjectPath(
  project: ProjectProgram,
  repositoryRoot: string,
): string {
  if (!isAbsolute(project.configPath)) {
    return project.configPath.split("\\").join("/");
  }
  return repositoryRelativePath(repositoryRoot, project.configPath) ?? "";
}

function stableId(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function evidenceFor(
  repositoryRoot: string,
  node: ts.Node,
): Evidence | undefined {
  const source = node.getSourceFile();
  const file = repositoryRelativePath(repositoryRoot, source.fileName);
  if (file === undefined) return undefined;
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return {
    file,
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function declarationKind(node: ts.Node): NodeKind | undefined {
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type_alias";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return "method";
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isVariableDeclaration(node)) {
    return (node.parent.flags & ts.NodeFlags.Const) !== 0
      ? "constant"
      : "variable";
  }
  if (
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return "property";
  }
  if (ts.isCallExpression(node)) return "test";
  return undefined;
}

function modifiersOf(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
}

function isDirectlyExported(node: ts.Node): boolean {
  const subject = ts.isVariableDeclaration(node) ? node.parent.parent : node;
  return modifiersOf(subject).some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.ExportKeyword ||
      modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );
}

function expressionLabel(expression: ts.Expression): string {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isIdentifier(expression)) return expression.text;
  return expression.getText(expression.getSourceFile()).slice(0, 160);
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
  ].join("\0");
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return (
    compareText(left.evidence.file, right.evidence.file) ||
    left.evidence.startLine - right.evidence.startLine ||
    left.evidence.startColumn - right.evidence.startColumn ||
    compareText(left.kind, right.kind) ||
    compareText(left.source, right.source) ||
    compareText(left.target, right.target) ||
    compareText(left.confidence, right.confidence)
  );
}

export function extractRelations(
  project: ProjectProgram,
  fragments: readonly GraphFragment[],
  repositoryRoot: string,
  lookupFragments: readonly GraphFragment[] = fragments,
): GraphFragment[] {
  const output = fragments
    .map((fragment) => ({
      ownerFile: fragment.ownerFile,
      nodes: [...fragment.nodes],
      edges: [...fragment.edges],
      diagnostics: [...fragment.diagnostics],
    }))
    .sort((left, right) => compareText(left.ownerFile, right.ownerFile));
  const fragmentByFile = new Map(
    output.map((fragment) => [fragment.ownerFile, fragment] as const),
  );
  const fileNodeByFile = new Map<string, GraphNode>();
  const nodesByPosition = new Map<string, GraphNode[]>();
  const nodeByQualifiedIdentity = new Map<string, GraphNode>();
  const nodeById = new Map<string, GraphNode>();
  const seenEdges = new Set<string>();
  const syntheticByKey = new Map<string, GraphNode>();

  function indexNode(node: GraphNode): void {
    nodeById.set(node.id, node);
    nodeByQualifiedIdentity.set(
      `${node.sourceFile}\0${node.qualifiedName}`,
      node,
    );
    if (node.kind === "file") fileNodeByFile.set(node.sourceFile, node);
    const key = `${node.sourceFile}\0${node.startLine}\0${node.startColumn}`;
    const positioned = nodesByPosition.get(key) ?? [];
    positioned.push(node);
    nodesByPosition.set(key, positioned);
  }

  for (const fragment of lookupFragments) {
    for (const node of fragment.nodes) indexNode(node);
  }
  for (const fragment of output) {
    for (const edge of fragment.edges) seenEdges.add(edgeKey(edge));
  }

  function nodeForDeclaration(node: ts.Node): GraphNode | undefined {
    const source = node.getSourceFile();
    const sourceFile = repositoryRelativePath(repositoryRoot, source.fileName);
    if (sourceFile === undefined) return undefined;
    if (ts.isSourceFile(node)) return fileNodeByFile.get(sourceFile);
    const location = source.getLineAndCharacterOfPosition(node.getStart(source));
    const candidates = nodesByPosition.get(
      `${sourceFile}\0${location.line + 1}\0${location.character + 1}`,
    );
    const kind = declarationKind(node);
    return candidates?.find((candidate) => candidate.kind === kind);
  }

  function canonicalSymbol(symbol: ts.Symbol | undefined): ts.Symbol | undefined {
    if (symbol === undefined) return undefined;
    return (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? project.checker.getAliasedSymbol(symbol)
      : symbol;
  }

  function nodeForSymbol(symbol: ts.Symbol | undefined): GraphNode | undefined {
    const canonical = canonicalSymbol(symbol);
    for (const declaration of canonical?.declarations ?? []) {
      const direct = nodeForDeclaration(declaration);
      if (direct !== undefined) return direct;
      if (ts.isBindingElement(declaration)) {
        const variable = declaration.parent.parent;
        const bindingNode = nodeForDeclaration(variable);
        if (bindingNode !== undefined) return bindingNode;
      }
    }
    return undefined;
  }

  function fileNodeForModuleSymbol(
    symbol: ts.Symbol | undefined,
  ): GraphNode | undefined {
    const canonical = canonicalSymbol(symbol);
    for (const declaration of canonical?.declarations ?? []) {
      const target = nodeForDeclaration(declaration.getSourceFile());
      if (target !== undefined && target.kind === "file") return target;
    }
    return undefined;
  }

  function nodeAtLocation(node: ts.Node): GraphNode | undefined {
    return nodeForSymbol(project.checker.getSymbolAtLocation(node));
  }

  function enclosingNode(node: ts.Node): GraphNode | undefined {
    let current: ts.Node | undefined = node;
    let nestedDeclaration: GraphNode | undefined;
    while (current !== undefined && !ts.isSourceFile(current)) {
      const graphNode = nodeForDeclaration(current);
      if (graphNode !== undefined) {
        if (
          graphNode.kind === "function" ||
          graphNode.kind === "method" ||
          graphNode.kind === "constructor" ||
          graphNode.kind === "test"
        ) {
          return graphNode;
        }
        nestedDeclaration ??= graphNode;
      }
      current = current.parent;
    }
    const sourceFile = repositoryRelativePath(
      repositoryRoot,
      node.getSourceFile().fileName,
    );
    return nestedDeclaration ??
      (sourceFile === undefined ? undefined : fileNodeByFile.get(sourceFile));
  }

  function addSyntheticNode(
    ownerFile: string,
    kind: "external_module" | "unresolved_symbol",
    qualifiedName: string,
    evidence: Evidence,
  ): GraphNode | undefined {
    const fragment = fragmentByFile.get(ownerFile);
    if (fragment === undefined) return undefined;
    const key = `${ownerFile}\0${kind}\0${qualifiedName}`;
    const existing = syntheticByKey.get(key);
    if (existing !== undefined) return existing;
    const node: GraphNode = {
      id: stableId(["relation", ownerFile, kind, qualifiedName]),
      kind,
      label: qualifiedName,
      qualifiedName,
      sourceFile: ownerFile,
      startLine: evidence.startLine,
      startColumn: evidence.startColumn,
      endLine: evidence.endLine,
      endColumn: evidence.endColumn,
      packageName: null,
      projectPath: configuredProjectPath(project, repositoryRoot),
      exported: false,
      signature: "",
      summary: "",
    };
    fragment.nodes.push(node);
    syntheticByKey.set(key, node);
    indexNode(node);
    return node;
  }

  function addEdge(
    source: GraphNode | undefined,
    target: GraphNode | undefined,
    kind: EdgeKind,
    confidence: Confidence,
    evidence: Evidence | undefined,
  ): void {
    if (
      source === undefined ||
      target === undefined ||
      evidence === undefined ||
      !nodeById.has(source.id) ||
      !nodeById.has(target.id)
    ) {
      return;
    }
    const fragment = fragmentByFile.get(evidence.file);
    if (fragment === undefined) return;
    const edge: GraphEdge = {
      source: source.id,
      target: target.id,
      kind,
      confidence,
      evidence,
    };
    const key = edgeKey(edge);
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    fragment.edges.push(edge);
  }

  const firstFragment = output[0];
  let projectNode: GraphNode | undefined;
  if (firstFragment !== undefined) {
    const configPath = configuredProjectPath(project, repositoryRoot);
    projectNode = {
      id: stableId(["project", configPath]),
      kind: "project",
      label: configPath,
      qualifiedName: configPath,
      sourceFile: configPath,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
      packageName: null,
      projectPath: configPath,
      exported: false,
      signature: "",
      summary: "",
    };
    firstFragment.nodes.push(projectNode);
    indexNode(projectNode);
  }

  for (const source of project.sourceFiles) {
    const relativeSourceFile = repositoryRelativePath(
      repositoryRoot,
      source.fileName,
    );
    if (
      relativeSourceFile === undefined ||
      !fragmentByFile.has(relativeSourceFile)
    ) {
      continue;
    }
    const ownerFile = relativeSourceFile;
    const fileNode = fileNodeByFile.get(ownerFile);
    const sourceEvidence = evidenceFor(repositoryRoot, source);
    addEdge(projectNode, fileNode, "contains", "syntactic", sourceEvidence);
    addEdge(fileNode, projectNode, "configured_by", "syntactic", sourceEvidence);

    function unresolvedTarget(
      displayName: string,
      evidence: Evidence | undefined,
    ): GraphNode | undefined {
      return evidence === undefined
        ? undefined
        : addSyntheticNode(ownerFile, "unresolved_symbol", displayName, evidence);
    }

    function resolvedOrUnresolved(
      location: ts.Node,
      displayName: string,
      evidence: Evidence | undefined,
    ): { node: GraphNode | undefined; confidence: Confidence } {
      const resolved = nodeAtLocation(location);
      return resolved === undefined
        ? { node: unresolvedTarget(displayName, evidence), confidence: "syntactic" }
        : { node: resolved, confidence: "resolved" };
    }

    function addDeclarationRelations(node: ts.Node): void {
      const declaration = nodeForDeclaration(node);
      if (declaration === undefined) return;
      const evidence = evidenceFor(repositoryRoot, node);
      addEdge(fileNode, declaration, "declares", "syntactic", evidence);
      let parent = node.parent;
      while (parent !== undefined && !ts.isSourceFile(parent)) {
        const container = nodeForDeclaration(parent);
        if (container !== undefined) {
          addEdge(container, declaration, "contains", "syntactic", evidence);
          break;
        }
        parent = parent.parent;
      }
      if (isDirectlyExported(node)) {
        const name = (node as ts.NamedDeclaration).name;
        const checkerTarget = nodeForSymbol(
          project.checker.getSymbolAtLocation(name ?? node),
        );
        addEdge(
          fileNode,
          declaration,
          "exports",
          checkerTarget?.id === declaration.id ? "resolved" : "syntactic",
          evidence,
        );
      }
    }

    function addImport(node: ts.ImportDeclaration): void {
      const evidence = evidenceFor(repositoryRoot, node.moduleSpecifier);
      const moduleName = ts.isStringLiteralLike(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : node.moduleSpecifier.getText(source);
      const target = nodeAtLocation(node.moduleSpecifier);
      if (target !== undefined && target.kind === "file") {
        addEdge(fileNode, target, "imports", "resolved", evidence);
      } else if (evidence !== undefined) {
        addEdge(
          fileNode,
          addSyntheticNode(ownerFile, "external_module", moduleName, evidence),
          "imports",
          "syntactic",
          evidence,
        );
      }
    }

    function addDynamicImport(node: ts.CallExpression): boolean {
      if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return false;
      const argument = node.arguments[0];
      if (argument === undefined) return true;
      const evidence = evidenceFor(repositoryRoot, argument);
      const moduleName = ts.isStringLiteralLike(argument)
        ? argument.text
        : argument.getText(source).slice(0, 160);
      const target = nodeAtLocation(argument);
      if (target !== undefined && target.kind === "file") {
        addEdge(fileNode, target, "dynamically_imports", "resolved", evidence);
      } else if (evidence !== undefined) {
        addEdge(
          fileNode,
          addSyntheticNode(ownerFile, "external_module", moduleName, evidence),
          "dynamically_imports",
          "syntactic",
          evidence,
        );
      }
      return true;
    }

    function addExportDeclaration(node: ts.ExportDeclaration): void {
      const evidence = evidenceFor(repositoryRoot, node);
      const isReExport = node.moduleSpecifier !== undefined;
      const moduleName = node.moduleSpecifier !== undefined &&
          ts.isStringLiteralLike(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : undefined;
      if (node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const target = nodeAtLocation(element.name);
          if (target !== undefined) {
            addEdge(
              fileNode,
              target,
              isReExport ? "re_exports" : "exports",
              "resolved",
              evidenceFor(repositoryRoot, element),
            );
          } else if (isReExport && moduleName !== undefined) {
            const elementEvidence = evidenceFor(repositoryRoot, element);
            addEdge(
              fileNode,
              elementEvidence === undefined
                ? undefined
                : addSyntheticNode(
                    ownerFile,
                    "external_module",
                    moduleName,
                    elementEvidence,
                  ),
              "re_exports",
              "syntactic",
              elementEvidence,
            );
          }
        }
      }
      if (
        isReExport &&
        node.exportClause !== undefined &&
        ts.isNamespaceExport(node.exportClause) &&
        moduleName !== undefined
      ) {
        const namespaceEvidence = evidenceFor(repositoryRoot, node.exportClause);
        const moduleTarget = fileNodeForModuleSymbol(
          project.checker.getSymbolAtLocation(node.moduleSpecifier!),
        );
        addEdge(
          fileNode,
          moduleTarget ??
            (namespaceEvidence === undefined
              ? undefined
              : addSyntheticNode(
                  ownerFile,
                  "external_module",
                  moduleName,
                  namespaceEvidence,
                )),
          "re_exports",
          moduleTarget === undefined ? "syntactic" : "resolved",
          namespaceEvidence,
        );
      }
      if (isReExport && node.exportClause === undefined) {
        const moduleSymbol = project.checker.getSymbolAtLocation(node.moduleSpecifier!);
        const canonical = canonicalSymbol(moduleSymbol);
        const internalModuleTarget = fileNodeForModuleSymbol(canonical);
        let emittedResolvedTarget = false;
        if (canonical !== undefined) {
          for (const symbol of project.checker.getExportsOfModule(canonical)) {
            const target = nodeForSymbol(symbol);
            if (target === undefined) continue;
            addEdge(
              fileNode,
              target,
              "re_exports",
              "resolved",
              evidence,
            );
            emittedResolvedTarget = true;
          }
        }
        if (!emittedResolvedTarget && moduleName !== undefined) {
          addEdge(
            fileNode,
            internalModuleTarget ??
              (evidence === undefined
                ? undefined
                : addSyntheticNode(
                    ownerFile,
                    "external_module",
                    moduleName,
                    evidence,
                  )),
            "re_exports",
            internalModuleTarget === undefined ? "syntactic" : "resolved",
            evidence,
          );
        }
      }
    }

    function addExportAssignment(node: ts.ExportAssignment): void {
      const evidence = evidenceFor(repositoryRoot, node.expression);
      const target = resolvedOrUnresolved(
        node.expression,
        node.expression.getText(source).slice(0, 160),
        evidence,
      );
      addEdge(fileNode, target.node, "exports", target.confidence, evidence);
    }

    function addHeritage(node: ts.ClassLikeDeclaration | ts.InterfaceDeclaration): void {
      const sourceNode = nodeForDeclaration(node);
      for (const clause of node.heritageClauses ?? []) {
        const kind: EdgeKind = clause.token === ts.SyntaxKind.ExtendsKeyword
          ? "extends"
          : "implements";
        for (const type of clause.types) {
          const evidence = evidenceFor(repositoryRoot, type.expression);
          const target = resolvedOrUnresolved(
            type.expression,
            type.expression.getText(source),
            evidence,
          );
          addEdge(sourceNode, target.node, kind, target.confidence, evidence);
          addEdge(sourceNode, target.node, "references", target.confidence, evidence);
        }
      }
    }

    function addOverride(node: ts.MethodDeclaration): void {
      if (!ts.isClassLike(node.parent)) return;
      const sourceNode = nodeForDeclaration(node);
      if (sourceNode === undefined) return;
      const name = node.name;
      if (!ts.isIdentifier(name) && !ts.isStringLiteralLike(name) && !ts.isNumericLiteral(name)) {
        return;
      }
      const classType = project.checker.getTypeAtLocation(node.parent);
      const baseTypes = classType.isClassOrInterface()
        ? project.checker.getBaseTypes(classType)
        : [];
      for (const baseType of baseTypes) {
        const baseMember = baseType.getProperty(name.text);
        const target = nodeForSymbol(baseMember);
        if (target !== undefined) {
          addEdge(
            sourceNode,
            target,
            "overrides",
            "resolved",
            evidenceFor(repositoryRoot, name),
          );
        }
      }
    }

    function addCall(node: ts.CallExpression): void {
      if (addDynamicImport(node)) return;
      const sourceNode = enclosingNode(node);
      const evidence = evidenceFor(repositoryRoot, node.expression);
      const signature = project.checker.getResolvedSignature(node);
      const signatureTarget = signature?.getDeclaration() === undefined
        ? undefined
        : nodeForDeclaration(signature.getDeclaration()!);
      const symbolLocation = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name
        : node.expression;
      const target = signatureTarget ?? nodeAtLocation(symbolLocation);
      const relationTarget = target === undefined
        ? unresolvedTarget(expressionLabel(node.expression), evidence)
        : target;
      addEdge(
        sourceNode,
        relationTarget,
        "calls",
        target === undefined ? "syntactic" : "resolved",
        evidence,
      );

      if (
        /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(ownerFile) &&
        target !== undefined &&
        isImportProximate(target)
      ) {
        addEdge(fileNode, target, "tests", "heuristic", evidence);
      }
    }

    function addInstantiation(node: ts.NewExpression): void {
      const evidence = evidenceFor(repositoryRoot, node.expression);
      const signature = project.checker.getResolvedSignature(node);
      const signatureDeclaration = signature?.getDeclaration();
      const signatureTarget = (
        signatureDeclaration === undefined
          ? undefined
          : nodeForDeclaration(signatureDeclaration)
      ) ?? nodeForSymbol(
        signature === undefined
          ? undefined
          : project.checker.getReturnTypeOfSignature(signature).getSymbol(),
      );
      const symbolLocation = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name
        : node.expression;
      const resolvedTarget = signatureTarget ?? nodeAtLocation(symbolLocation);
      const target = resolvedTarget === undefined
        ? unresolvedTarget(expressionLabel(node.expression), evidence)
        : resolvedTarget;
      addEdge(
        enclosingNode(node),
        target,
        "instantiates",
        resolvedTarget === undefined ? "syntactic" : "resolved",
        evidence,
      );
    }

    function addReference(node: ts.Identifier): void {
      const target = nodeAtLocation(node);
      if (target === undefined) return;
      const sourceNode = enclosingNode(node);
      if (sourceNode === undefined || sourceNode.id === target.id) return;
      addEdge(
        sourceNode,
        target,
        "references",
        "resolved",
        evidenceFor(repositoryRoot, node),
      );
    }

    const importedNodeIds = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const clause = statement.importClause;
      if (clause?.name !== undefined) {
        const imported = nodeAtLocation(clause.name);
        if (imported !== undefined) importedNodeIds.add(imported.id);
      }
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        const imported = nodeAtLocation(bindings.name);
        if (imported !== undefined) importedNodeIds.add(imported.id);
      } else if (bindings !== undefined) {
        for (const element of bindings.elements) {
          const imported = nodeAtLocation(element.name);
          if (imported !== undefined) importedNodeIds.add(imported.id);
        }
      }
    }

    function isImportProximate(target: GraphNode): boolean {
      if (importedNodeIds.has(target.id)) return true;
      const separator = target.qualifiedName.lastIndexOf(".");
      if (separator < 0) return false;
      const containingName = target.qualifiedName.slice(0, separator);
      const container = nodeByQualifiedIdentity.get(
        `${target.sourceFile}\0${containingName}`,
      );
      return container !== undefined && importedNodeIds.has(container.id);
    }

    function visit(node: ts.Node): void {
      addDeclarationRelations(node);
      if (ts.isImportDeclaration(node)) addImport(node);
      if (ts.isExportDeclaration(node)) addExportDeclaration(node);
      if (ts.isExportAssignment(node)) addExportAssignment(node);
      if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        addHeritage(node);
      }
      if (ts.isMethodDeclaration(node)) addOverride(node);
      if (ts.isCallExpression(node)) addCall(node);
      if (ts.isNewExpression(node)) addInstantiation(node);
      if (ts.isIdentifier(node)) addReference(node);
      ts.forEachChild(node, visit);
    }

    ts.forEachChild(source, visit);
  }

  for (const fragment of output) {
    fragment.nodes.sort((left, right) =>
      left.startLine - right.startLine ||
      left.startColumn - right.startColumn ||
      compareText(left.kind, right.kind) ||
      compareText(left.id, right.id)
    );
    fragment.edges.sort(compareEdges);
  }
  return output;
}
