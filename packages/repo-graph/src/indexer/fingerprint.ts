import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { CompilerAdapter } from "../compiler/load-compiler.js";
import type { ProjectProgram } from "../compiler/create-programs.js";
import type { Discovery } from "../discovery/discover.js";
import { SCHEMA_VERSION } from "../storage/schema.js";

export const TOOL_VERSION = "0.1.0";

export interface IndexFingerprint {
  schemaVersion: number;
  toolVersion: string;
  compilerVersion: string;
  contentHash: string;
  configHash: string;
}

export interface FingerprintResult {
  fingerprint: IndexFingerprint;
  reusable: boolean;
}

function repositoryRelativePath(
  repositoryRoot: string,
  candidate: string,
): string | undefined {
  const path = relative(repositoryRoot, candidate);
  if (
    path === ".." ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path)
  ) {
    return undefined;
  }
  return path.split(sep).join("/");
}

async function localFile(
  repositoryRoot: string,
  candidate: string,
): Promise<string | undefined> {
  const canonical = await realpath(candidate);
  return repositoryRelativePath(repositoryRoot, canonical);
}

async function hashFiles(
  repositoryRoot: string,
  files: ReadonlySet<string>,
): Promise<string> {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    const contents = await readFile(join(repositoryRoot, file));
    hash.update(file);
    hash.update("\0");
    hash.update(String(contents.byteLength));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function addPackageAncestors(
  repositoryRoot: string,
  file: string,
  configFiles: Set<string>,
): Promise<void> {
  let directory = dirname(join(repositoryRoot, file));
  while (repositoryRelativePath(repositoryRoot, directory) !== undefined) {
    const packagePath = join(directory, "package.json");
    try {
      const packageFile = await localFile(repositoryRoot, packagePath);
      if (packageFile !== undefined) configFiles.add(packageFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (directory === repositoryRoot) break;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
}

/**
 * Fingerprints the repository-local inputs used by TypeScript programs.
 * Dependencies outside the repository cannot be tracked atomically with the
 * repository, so their presence conservatively disables index reuse.
 */
export async function createIndexFingerprint(
  repositoryRoot: string,
  discovery: Discovery,
  compiler: CompilerAdapter,
  programs: readonly ProjectProgram[],
): Promise<FingerprintResult> {
  const canonicalRoot = await realpath(repositoryRoot);
  const contentFiles = new Set(discovery.sourceFiles);
  const configFiles = new Set([
    ...discovery.packageJsonFiles,
    ...discovery.tsconfigFiles,
  ]);
  let reusable = true;

  for (const project of programs) {
    for (const dependency of project.configDependencies) {
      const file = await localFile(canonicalRoot, dependency);
      if (file === undefined) {
        reusable = false;
      } else {
        configFiles.add(file);
      }
    }

    for (const sourceFile of project.program.getSourceFiles()) {
      if (
        compiler.source === "bundled" &&
        project.program.isSourceFileDefaultLibrary(sourceFile)
      ) {
        continue;
      }
      const file = await localFile(canonicalRoot, resolve(sourceFile.fileName));
      if (file === undefined) {
        reusable = false;
        continue;
      }
      contentFiles.add(file);
      await addPackageAncestors(canonicalRoot, file, configFiles);
    }
  }

  const [contentHash, configHash] = await Promise.all([
    hashFiles(canonicalRoot, contentFiles),
    hashFiles(canonicalRoot, configFiles),
  ]);
  return {
    fingerprint: {
      schemaVersion: SCHEMA_VERSION,
      toolVersion: TOOL_VERSION,
      compilerVersion: compiler.version,
      contentHash,
      configHash,
    },
    reusable,
  };
}
