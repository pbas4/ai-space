import { createRequire } from "node:module";

import type * as ts from "typescript";

import { ExitCode, type Result } from "../domain/diagnostic.js";

export interface CompilerAdapter {
  version: string;
  typescript: typeof ts;
  source: "bundled";
}

function isSupportedVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(
    version,
  );
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4];
  if (major === 6) return true;
  if (major !== 5 || minor < 4) return false;
  if (minor > 4 || patch > 0) return true;
  return prerelease === undefined;
}

function unsupportedCompiler(version: string): Result<CompilerAdapter> {
  return {
    ok: false,
    exitCode: ExitCode.InvalidInput,
    diagnostics: [
      {
        code: "UNSUPPORTED_TYPESCRIPT",
        level: "error",
        message: `Bundled TypeScript ${version} is unsupported; reinstall repo-graph with its bundled compiler.`,
      },
    ],
  };
}

function compilerLoadFailure(): Result<CompilerAdapter> {
  return {
    ok: false,
    exitCode: ExitCode.InternalFailure,
    diagnostics: [
      {
        code: "TYPESCRIPT_LOAD_FAILED",
        level: "error",
        message: "A compatible TypeScript compiler could not be loaded.",
      },
    ],
  };
}

export async function loadCompiler(
  _repoRoot: string,
): Promise<Result<CompilerAdapter>> {
  try {
    const bundledRequire = createRequire(import.meta.url);
    const compiler = bundledRequire("typescript") as typeof ts;
    if (!isSupportedVersion(compiler.version)) {
      return unsupportedCompiler(compiler.version);
    }
    return {
      ok: true,
      value: {
        version: compiler.version,
        typescript: compiler,
        source: "bundled",
      },
      diagnostics: [],
    };
  } catch {
    return compilerLoadFailure();
  }
}
