import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep, win32 } from "node:path";

import { ExitCode, type Diagnostic, type Result } from "../domain/diagnostic.js";

export interface LocalRepository {
  root: string;
  dataDir: string;
}

const REMOTE_SCHEMES = /^(?:https?|ssh|git|file|npm):/i;
const SCP_STYLE = /^(?:[^/\\\s@:]+@)?[^/\\\s:]+:.+$/;
const SCOPED_PACKAGE = /^@[^/\\\s]+\/[^/\\\s]+$/;

function invalidResult<T>(diagnostic: Diagnostic): Result<T> {
  return {
    ok: false,
    exitCode: ExitCode.InvalidInput,
    diagnostics: [diagnostic],
  };
}

function isRemoteShaped(input: string): boolean {
  if (win32.isAbsolute(input)) return false;
  return (
    REMOTE_SCHEMES.test(input) ||
    SCP_STYLE.test(input) ||
    SCOPED_PACKAGE.test(input)
  );
}

export async function resolveLocalRepository(
  input: string,
  cwd: string,
): Promise<Result<LocalRepository>> {
  if (isRemoteShaped(input)) {
    return invalidResult({
      code: "LOCAL_PATH_REQUIRED",
      level: "error",
      message: "Repository input must be an existing local filesystem path.",
    });
  }

  const requestedPath = resolve(cwd, input);
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(requestedPath);
  } catch {
    return invalidResult({
      code: "LOCAL_PATH_NOT_FOUND",
      level: "error",
      message: "Repository path does not exist or cannot be resolved.",
    });
  }

  try {
    const repositoryStat = await stat(canonicalRoot);
    if (!repositoryStat.isDirectory()) {
      return invalidResult({
        code: "LOCAL_DIRECTORY_REQUIRED",
        level: "error",
        message: "Repository path must resolve to a directory.",
      });
    }
  } catch {
    return invalidResult({
      code: "LOCAL_PATH_NOT_FOUND",
      level: "error",
      message: "Repository path does not exist or cannot be inspected.",
    });
  }

  return {
    ok: true,
    value: {
      root: canonicalRoot,
      dataDir: join(canonicalRoot, ".repo-graph"),
    },
    diagnostics: [],
  };
}

export async function assertContainedPath(
  repositoryRoot: string,
  candidatePath: string,
): Promise<Result<string>> {
  let canonicalRoot: string;
  let canonicalCandidate: string;
  try {
    [canonicalRoot, canonicalCandidate] = await Promise.all([
      realpath(repositoryRoot),
      realpath(resolve(repositoryRoot, candidatePath)),
    ]);
  } catch {
    return invalidResult({
      code: "LOCAL_PATH_NOT_FOUND",
      level: "error",
      message: "Candidate path does not exist or cannot be resolved.",
    });
  }

  const relativePath = relative(canonicalRoot, canonicalCandidate);
  const escapesRoot =
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath);

  if (escapesRoot) {
    return invalidResult({
      code: "PATH_OUTSIDE_REPOSITORY",
      level: "error",
      message: "Candidate path resolves outside the repository root.",
    });
  }

  return { ok: true, value: canonicalCandidate, diagnostics: [] };
}
