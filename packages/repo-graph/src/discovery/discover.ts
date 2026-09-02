import { opendir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  ExitCode,
  type Diagnostic,
  type Result,
} from "../domain/diagnostic.js";
import type { LocalRepository } from "../local/path-policy.js";
import { isIgnored, parseIgnoreFile, type IgnoreRule } from "./ignore.js";

export interface Discovery {
  repositoryRoot: string;
  packageJsonFiles: string[];
  tsconfigFiles: string[];
  sourceFiles: string[];
  ignoredFiles: number;
  diagnostics: Diagnostic[];
}

const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u;
const TSCONFIG_FILE = /^tsconfig(?:\.[^/]+)?\.json$/u;
const MINIFIED_FILE = /\.min\.(?:js|jsx|mjs|cjs)$/u;
const GENERATED_FILE = /\.(?:generated|gen)\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u;
const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".next",
  ".nuxt",
  ".repo-graph",
  ".turbo",
  ".yarn",
  "__generated__",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "target",
]);

function toPosixRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isDefaultExcluded(name: string, isDirectory: boolean): boolean {
  if (isDirectory) return DEFAULT_EXCLUDED_DIRECTORIES.has(name);
  return MINIFIED_FILE.test(name) || GENERATED_FILE.test(name);
}

export async function discoverRepository(
  repo: LocalRepository,
): Promise<Result<Discovery>> {
  const packageJsonFiles: string[] = [];
  const tsconfigFiles: string[] = [];
  const sourceFiles: string[] = [];
  const diagnostics: Diagnostic[] = [];
  let ignoredFiles = 0;

  async function walk(directory: string, inheritedRules: IgnoreRule[]): Promise<void> {
    const directoryRelative = toPosixRelative(repo.root, directory);
    let rules = inheritedRules;

    try {
      const ignoreContents = await readFile(join(directory, ".gitignore"), "utf8");
      rules = [
        ...inheritedRules,
        ...parseIgnoreFile(ignoreContents, directoryRelative),
      ];
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }

    const openDirectory = await opendir(directory);
    for await (const entry of openDirectory) {
      const absolutePath = join(directory, entry.name);
      const relativePath = toPosixRelative(repo.root, absolutePath);

      if (entry.isSymbolicLink()) {
        ignoredFiles += 1;
        continue;
      }

      if (isDefaultExcluded(entry.name, entry.isDirectory())) {
        ignoredFiles += 1;
        continue;
      }

      const ignored = isIgnored(relativePath, rules);
      if (entry.isDirectory()) {
        if (ignored) {
          ignoredFiles += 1;
          continue;
        }
        await walk(absolutePath, rules);
        continue;
      }

      if (!entry.isFile()) continue;
      if (ignored) {
        ignoredFiles += 1;
        continue;
      }

      if (entry.name === "package.json") {
        packageJsonFiles.push(relativePath);
      } else if (TSCONFIG_FILE.test(entry.name)) {
        tsconfigFiles.push(relativePath);
      } else if (SOURCE_EXTENSION.test(entry.name)) {
        sourceFiles.push(relativePath);
      }
    }
  }

  try {
    await walk(repo.root, []);
  } catch {
    return {
      ok: false,
      exitCode: ExitCode.InvalidInput,
      diagnostics: [
        {
          code: "REPOSITORY_DISCOVERY_FAILED",
          level: "error",
          message: "Repository files could not be discovered.",
        },
      ],
    };
  }

  packageJsonFiles.sort(comparePaths);
  tsconfigFiles.sort(comparePaths);
  sourceFiles.sort(comparePaths);

  return {
    ok: true,
    value: {
      repositoryRoot: repo.root,
      packageJsonFiles,
      tsconfigFiles,
      sourceFiles,
      ignoredFiles,
      diagnostics,
    },
    diagnostics,
  };
}
