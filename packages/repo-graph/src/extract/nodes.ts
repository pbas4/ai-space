import { createHash } from "node:crypto";
import { isAbsolute, relative, sep } from "node:path";

import * as ts from "typescript";

import type { ProjectProgram } from "../compiler/create-programs.js";
import type { GraphFragment, GraphNode, NodeKind } from "../domain/graph.js";

const SUMMARY_LIMIT = 500;
const TEST_FUNCTIONS = new Set(["describe", "it", "test"]);

interface DeclarationDetails {
  kind: NodeKind;
  label: string;
  qualifiedName: string;
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

function projectPath(project: ProjectProgram, repositoryRoot: string): string {
  if (!isAbsolute(project.configPath)) {
    return project.configPath.split("\\").join("/");
  }
  return repositoryRelativePath(repositoryRoot, project.configPath) ?? "";
}

function modifiersOf(node: ts.Node): readonly ts.Modifier[] {
  return ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
}

function moduleExportSymbols(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
): ReadonlySet<ts.Symbol> {
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) return new Set();
  return new Set(
    checker.getExportsOfModule(moduleSymbol).map((symbol) =>
      (symbol.flags & ts.SymbolFlags.Alias) !== 0
        ? checker.getAliasedSymbol(symbol)
        : symbol
    ),
  );
}

function isExported(
  checker: ts.TypeChecker,
  moduleExports: ReadonlySet<ts.Symbol>,
  node: ts.Node,
): boolean {
  if (
    modifiersOf(node).some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword ||
        modifier.kind === ts.SyntaxKind.DefaultKeyword,
    )
  ) {
    return true;
  }

  const statement = ts.isVariableDeclaration(node)
    ? node.parent.parent
    : undefined;
  if (
    statement !== undefined && modifiersOf(statement).some(
      (modifier) =>
        modifier.kind === ts.SyntaxKind.ExportKeyword ||
        modifier.kind === ts.SyntaxKind.DefaultKeyword,
    )
  ) {
    return true;
  }

  const name = (node as ts.NamedDeclaration).name;
  if (name === undefined) return false;
  const symbol = checker.getSymbolAtLocation(name);
  return symbol !== undefined && moduleExports.has(symbol);
}

function declarationName(
  name: ts.DeclarationName | ts.BindingName | undefined,
): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    const names = name.elements.flatMap((element) => {
      if (ts.isOmittedExpression(element)) return [];
      const nested = declarationName(element.name);
      return nested === undefined ? [] : [nested];
    });
    return names.length === 0 ? undefined : names.join(",");
  }
  return "[computed]";
}

function callName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function declarationDetails(
  node: ts.Node,
  scope: readonly string[],
): DeclarationDetails | undefined {
  let kind: NodeKind;
  let label: string | undefined;

  if (ts.isClassDeclaration(node)) {
    kind = "class";
    label = declarationName(node.name) ?? "default";
  } else if (ts.isInterfaceDeclaration(node)) {
    kind = "interface";
    label = declarationName(node.name);
  } else if (ts.isTypeAliasDeclaration(node)) {
    kind = "type_alias";
    label = declarationName(node.name);
  } else if (ts.isEnumDeclaration(node)) {
    kind = "enum";
    label = declarationName(node.name);
  } else if (ts.isFunctionDeclaration(node)) {
    kind = "function";
    label = declarationName(node.name) ?? "default";
  } else if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
    kind = "method";
    label = declarationName(node.name);
  } else if (ts.isConstructorDeclaration(node)) {
    kind = "constructor";
    label = "constructor";
  } else if (
    ts.isVariableDeclaration(node) &&
    (node.parent.flags & ts.NodeFlags.Const) !== 0
  ) {
    kind = "constant";
    label = declarationName(node.name);
  } else if (ts.isVariableDeclaration(node)) {
    kind = "variable";
    label = declarationName(node.name);
  } else if (
    (ts.isPropertyDeclaration(node) && ts.isClassLike(node.parent)) ||
    (ts.isPropertySignature(node) &&
      ts.isInterfaceDeclaration(node.parent)) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    kind = "property";
    label = declarationName(node.name);
  } else if (ts.isCallExpression(node)) {
    const functionName = callName(node.expression);
    const title = node.arguments[0];
    if (
      functionName === undefined ||
      !TEST_FUNCTIONS.has(functionName) ||
      title === undefined ||
      !ts.isStringLiteralLike(title)
    ) {
      return undefined;
    }
    kind = "test";
    label = title.text;
  } else {
    return undefined;
  }

  if (label === undefined) return undefined;
  return {
    kind,
    label,
    qualifiedName: [...scope, label].join("."),
  };
}

function childScope(
  node: ts.Node,
  scope: readonly string[],
  details: DeclarationDetails | undefined,
): readonly string[] {
  if (details === undefined) return scope;
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node)
  ) {
    return [...scope, details.label];
  }
  return scope;
}

function documentationSummary(
  checker: ts.TypeChecker,
  node: ts.Node,
): string {
  const namedNode = node as ts.NamedDeclaration;
  const symbol = namedNode.name === undefined
    ? checker.getSymbolAtLocation(node)
    : checker.getSymbolAtLocation(namedNode.name);
  if (symbol === undefined) return "";
  return ts.displayPartsToString(symbol.getDocumentationComment(checker))
    .trim()
    .slice(0, SUMMARY_LIMIT);
}

function declarationSignature(
  checker: ts.TypeChecker,
  node: ts.Node,
): string {
  if (ts.isFunctionLike(node)) {
    const signature = checker.getSignatureFromDeclaration(node);
    if (signature !== undefined) {
      return checker.signatureToString(
        signature,
        node,
        ts.TypeFormatFlags.NoTruncation,
        ts.isConstructorDeclaration(node)
          ? ts.SignatureKind.Construct
          : ts.SignatureKind.Call,
      );
    }
  }

  const namedNode = node as ts.NamedDeclaration;
  if (namedNode.name === undefined) return "";
  return checker.typeToString(
    checker.getTypeAtLocation(namedNode.name),
    namedNode.name,
    ts.TypeFormatFlags.NoTruncation,
  );
}

function provisionalId(
  sourceFile: string,
  syntaxKind: ts.SyntaxKind,
  qualifiedName: string,
  declarationStart: number,
): string {
  return createHash("sha256")
    .update(
      [sourceFile, String(syntaxKind), qualifiedName, String(declarationStart)].join(
        "\0",
      ),
    )
    .digest("hex");
}

function graphNode(
  project: ProjectProgram,
  moduleExports: ReadonlySet<ts.Symbol>,
  repositoryRoot: string,
  source: ts.SourceFile,
  sourceFile: string,
  node: ts.Node,
  details: DeclarationDetails,
): GraphNode {
  const start = node.getStart(source);
  const end = node.getEnd();
  const startLocation = source.getLineAndCharacterOfPosition(start);
  const endLocation = source.getLineAndCharacterOfPosition(end);
  return {
    id: provisionalId(sourceFile, node.kind, details.qualifiedName, start),
    kind: details.kind,
    label: details.label,
    qualifiedName: details.qualifiedName,
    sourceFile,
    startLine: startLocation.line + 1,
    startColumn: startLocation.character + 1,
    endLine: endLocation.line + 1,
    endColumn: endLocation.character + 1,
    packageName: null,
    projectPath: projectPath(project, repositoryRoot),
    exported: isExported(project.checker, moduleExports, node),
    signature: declarationSignature(project.checker, node),
    summary: documentationSummary(project.checker, node),
  };
}

function fileNode(
  project: ProjectProgram,
  repositoryRoot: string,
  source: ts.SourceFile,
  sourceFile: string,
): GraphNode {
  const endLocation = source.getLineAndCharacterOfPosition(source.getEnd());
  return {
    id: provisionalId(sourceFile, source.kind, sourceFile, source.getStart(source)),
    kind: "file",
    label: sourceFile,
    qualifiedName: sourceFile,
    sourceFile,
    startLine: 1,
    startColumn: 1,
    endLine: endLocation.line + 1,
    endColumn: endLocation.character + 1,
    packageName: null,
    projectPath: projectPath(project, repositoryRoot),
    exported: false,
    signature: "",
    summary: "",
  };
}

function extractSourceFile(
  project: ProjectProgram,
  repositoryRoot: string,
  source: ts.SourceFile,
  sourceFile: string,
): GraphFragment {
  const nodes = [fileNode(project, repositoryRoot, source, sourceFile)];
  const moduleExports = moduleExportSymbols(project.checker, source);

  function visit(node: ts.Node, scope: readonly string[]): void {
    const details = declarationDetails(node, scope);
    if (details !== undefined) {
      nodes.push(
        graphNode(
          project,
          moduleExports,
          repositoryRoot,
          source,
          sourceFile,
          node,
          details,
        ),
      );
    }
    const nextScope = childScope(node, scope, details);
    ts.forEachChild(node, (child) => visit(child, nextScope));
  }

  ts.forEachChild(source, (node) => visit(node, []));
  return {
    ownerFile: sourceFile,
    nodes,
    edges: [],
    diagnostics: project.diagnostics.filter(
      (diagnostic) =>
        diagnostic.file === undefined || diagnostic.file === sourceFile,
    ),
  };
}

export function extractNodes(
  project: ProjectProgram,
  repositoryRoot: string,
): GraphFragment[] {
  return project.sourceFiles
    .flatMap((source) => {
      const sourceFile = repositoryRelativePath(repositoryRoot, source.fileName);
      return sourceFile === undefined
        ? []
        : [extractSourceFile(project, repositoryRoot, source, sourceFile)];
    })
    .sort((left, right) =>
      left.ownerFile < right.ownerFile
        ? -1
        : left.ownerFile > right.ownerFile
          ? 1
          : 0
    );
}
