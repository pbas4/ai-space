import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type * as ts from "typescript";

import type { CompilerAdapter } from "./load-compiler.js";
import type { Discovery } from "../discovery/discover.js";
import {
  ExitCode,
  type Diagnostic,
  type DiagnosticLevel,
  type Result,
} from "../domain/diagnostic.js";

export interface ProjectProgram {
  configPath: string;
  configDependencies: string[];
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFiles: ts.SourceFile[];
  diagnostics: Diagnostic[];
}

const INFERRED_CONFIG_PATH = "<inferred>";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function diagnosticLevel(
  compiler: typeof ts,
  category: ts.DiagnosticCategory,
): DiagnosticLevel {
  if (category === compiler.DiagnosticCategory.Error) return "error";
  if (category === compiler.DiagnosticCategory.Warning) return "warning";
  return "info";
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

function convertDiagnostic(
  compiler: typeof ts,
  repositoryRoot: string,
  compilerDiagnostic: ts.Diagnostic,
): Diagnostic {
  const file = compilerDiagnostic.file
    ? repositoryRelativePath(repositoryRoot, compilerDiagnostic.file.fileName)
    : undefined;
  const diagnostic: Diagnostic = {
    code: `TS${compilerDiagnostic.code}`,
    level: diagnosticLevel(compiler, compilerDiagnostic.category),
    message: compiler.flattenDiagnosticMessageText(
      compilerDiagnostic.messageText,
      "\n",
    ),
  };
  if (file !== undefined) diagnostic.file = file;
  return diagnostic;
}

export async function createPrograms(
  adapter: CompilerAdapter,
  discovery: Discovery,
): Promise<Result<ProjectProgram[]>> {
  const compiler = adapter.typescript;
  const projectPrograms: ProjectProgram[] = [];
  const allDiagnostics: Diagnostic[] = [];
  const discoveredSourceFiles = new Set(
    discovery.sourceFiles.map((file) => resolve(discovery.repositoryRoot, file)),
  );

  try {
    for (const configPath of [...discovery.tsconfigFiles].sort(compareText)) {
      const absoluteConfigPath = join(discovery.repositoryRoot, configPath);
      const configDependencies = new Set([resolve(absoluteConfigPath)]);
      const readResult = compiler.readConfigFile(
        absoluteConfigPath,
        compiler.sys.readFile,
      );
      const compilerDiagnostics: ts.Diagnostic[] = [];
      if (readResult.error !== undefined) {
        compilerDiagnostics.push(readResult.error);
      }

      const parseHost: ts.ParseConfigHost = {
        useCaseSensitiveFileNames: compiler.sys.useCaseSensitiveFileNames,
        readDirectory: compiler.sys.readDirectory,
        fileExists: compiler.sys.fileExists,
        readFile: (fileName) => {
          configDependencies.add(resolve(fileName));
          return compiler.sys.readFile(fileName);
        },
      };
      const parsed = compiler.parseJsonConfigFileContent(
        readResult.config ?? {},
        parseHost,
        dirname(absoluteConfigPath),
        undefined,
        absoluteConfigPath,
      );
      compilerDiagnostics.push(...parsed.errors);

      const program = compiler.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        ...(parsed.projectReferences === undefined
          ? {}
          : { projectReferences: parsed.projectReferences }),
      });
      compilerDiagnostics.push(...compiler.getPreEmitDiagnostics(program));

      const diagnostics = compilerDiagnostics.map((diagnostic) =>
        convertDiagnostic(compiler, discovery.repositoryRoot, diagnostic),
      );
      const sourceFiles = program
        .getSourceFiles()
        .filter(
          (sourceFile) =>
            !program.isSourceFileDefaultLibrary(sourceFile) &&
            discoveredSourceFiles.has(resolve(sourceFile.fileName)),
        )
        .sort((left, right) =>
          compareText(
            repositoryRelativePath(discovery.repositoryRoot, left.fileName) ??
              left.fileName,
            repositoryRelativePath(discovery.repositoryRoot, right.fileName) ??
              right.fileName,
          )
        );

      allDiagnostics.push(...diagnostics);
      projectPrograms.push({
        configPath,
        configDependencies: [...configDependencies].sort(compareText),
        program,
        checker: program.getTypeChecker(),
        sourceFiles,
        diagnostics,
      });
    }

    const ownersBySource = new Map<string, number[]>();
    for (const [projectIndex, project] of projectPrograms.entries()) {
      for (const sourceFile of project.sourceFiles) {
        const sourcePath = resolve(sourceFile.fileName);
        const owners = ownersBySource.get(sourcePath) ?? [];
        owners.push(projectIndex);
        ownersBySource.set(sourcePath, owners);
      }
    }

    for (const [sourcePath, ownerIndexes] of ownersBySource) {
      if (ownerIndexes.length < 2) continue;
      const ownerPaths = ownerIndexes.map(
        (projectIndex) => projectPrograms[projectIndex]?.configPath ?? "",
      );
      const selectedOwner = ownerPaths[0] ?? "";
      const sourceFile = repositoryRelativePath(
        discovery.repositoryRoot,
        sourcePath,
      );
      const diagnostic: Diagnostic = {
        code: "AMBIGUOUS_SOURCE_OWNERSHIP",
        level: "warning",
        message:
          `Source is included by multiple TypeScript configs (${ownerPaths.join(", ")}); ` +
          `indexed under ${selectedOwner}. Remove overlapping files/include entries to make ownership explicit.`,
        ...(sourceFile === undefined ? {} : { file: sourceFile }),
      };
      allDiagnostics.push(diagnostic);
    }

    for (const [projectIndex, project] of projectPrograms.entries()) {
      project.sourceFiles = project.sourceFiles.filter(
        (sourceFile) =>
          ownersBySource.get(resolve(sourceFile.fileName))?.[0] === projectIndex,
      );
    }

    const uncoveredSourcePaths = discovery.sourceFiles
      .map((file) => resolve(discovery.repositoryRoot, file))
      .filter((file) => !ownersBySource.has(file));
    if (uncoveredSourcePaths.length > 0) {
      const program = compiler.createProgram({
        rootNames: uncoveredSourcePaths,
        options: {
          allowJs: true,
          checkJs: false,
          jsx: compiler.JsxEmit.Preserve,
          noEmit: true,
          skipLibCheck: true,
        },
      });
      const compilerDiagnostics = compiler.getPreEmitDiagnostics(program).map(
        (diagnostic) =>
          convertDiagnostic(compiler, discovery.repositoryRoot, diagnostic),
      );
      const coverageDiagnostics = uncoveredSourcePaths.map((sourcePath) => ({
        code: "SOURCE_NOT_IN_TSCONFIG",
        level: "warning" as const,
        message:
          "Source is not included by a discovered TypeScript config and was indexed with inferred compiler options. Add it to a tsconfig files/include entry for configured ownership.",
        file: repositoryRelativePath(discovery.repositoryRoot, sourcePath),
      })).map(({ file, ...diagnostic }) =>
        file === undefined ? diagnostic : { ...diagnostic, file }
      );
      const diagnostics = [...compilerDiagnostics, ...coverageDiagnostics];
      const uncoveredSet = new Set(uncoveredSourcePaths);
      const sourceFiles = program
        .getSourceFiles()
        .filter(
          (sourceFile) =>
            !program.isSourceFileDefaultLibrary(sourceFile) &&
            uncoveredSet.has(resolve(sourceFile.fileName)),
        )
        .sort((left, right) =>
          compareText(
            repositoryRelativePath(discovery.repositoryRoot, left.fileName) ??
              left.fileName,
            repositoryRelativePath(discovery.repositoryRoot, right.fileName) ??
              right.fileName,
          )
        );

      allDiagnostics.push(...diagnostics);
      projectPrograms.push({
        configPath: INFERRED_CONFIG_PATH,
        configDependencies: [],
        program,
        checker: program.getTypeChecker(),
        sourceFiles,
        diagnostics,
      });
    }
  } catch {
    return {
      ok: false,
      exitCode: ExitCode.InternalFailure,
      diagnostics: [
        {
          code: "PROGRAM_CREATION_FAILED",
          level: "error",
          message: "TypeScript project programs could not be created.",
        },
      ],
    };
  }

  return { ok: true, value: projectPrograms, diagnostics: allDiagnostics };
}
