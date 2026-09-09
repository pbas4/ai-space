import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { ExitCode, type Result } from "../domain/diagnostic.js";
import type { LocalRepository } from "../local/path-policy.js";

const START_MARKER = "<!-- repo-graph:start -->";
const END_MARKER = "<!-- repo-graph:end -->";
const ADDED_SEPARATOR = "<!-- repo-graph:added-leading-newline -->";
const SKILL_RELATIVE_PATH = join(".agents", "skills", "repo-graph", "SKILL.md");
const SKILL_DIRECTORY = join(".agents", "skills", "repo-graph");
const IGNORE_ENTRY = ".repo-graph/";
const MANAGED_INSTRUCTIONS = [
  "## Repository graph",
  "Use the repository-scoped instructions in `.agents/skills/repo-graph/SKILL.md` when navigating this codebase.",
].join("\n");

export interface SkillChange {
  operation: "install" | "uninstall";
  changed: boolean;
  paths: string[];
}

export interface SkillInstallOptions {
  writeFile?: (file: string, content: string) => Promise<void>;
}

function failure(code: string, message: string): Result<SkillChange> {
  return {
    ok: false,
    exitCode: ExitCode.InternalFailure,
    diagnostics: [{ code, level: "error", message }],
  };
}

function invalidFailure(code: string, message: string): Result<SkillChange> {
  return {
    ok: false,
    exitCode: ExitCode.InvalidInput,
    diagnostics: [{ code, level: "error", message }],
  };
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function readOptionalFile(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function isSafeRepository(repo: LocalRepository): Promise<boolean> {
  if (!isAbsolute(repo.root) || !isAbsolute(repo.dataDir)) return false;
  if (resolve(repo.dataDir) !== resolve(repo.root, ".repo-graph")) return false;
  try {
    const root = await stat(repo.root);
    return root.isDirectory() && await realpath(repo.root) === resolve(repo.root);
  } catch {
    return false;
  }
}

async function assertSafeExistingPath(file: string, directory: boolean): Promise<void> {
  try {
    const entry = await lstat(file);
    if (entry.isSymbolicLink()) throw new Error("symbolic link");
    if (directory ? !entry.isDirectory() : !entry.isFile()) {
      throw new Error("unexpected file type");
    }
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
}

async function prepareSkillDirectory(root: string): Promise<string> {
  const agents = join(root, ".agents");
  const skills = join(agents, "skills");
  const owned = join(skills, "repo-graph");
  for (const directory of [agents, skills, owned]) {
    await assertSafeExistingPath(directory, true);
    await mkdir(directory, { recursive: true });
  }
  return owned;
}

function markerRange(content: string):
  | { start: number; end: number; separatorAdded: boolean }
  | undefined
  | null {
  const start = content.indexOf(START_MARKER);
  const endStart = content.indexOf(END_MARKER);
  if (start < 0 && endStart < 0) return undefined;
  if (
    start < 0 ||
    endStart < start ||
    content.indexOf(START_MARKER, start + START_MARKER.length) >= 0 ||
    content.indexOf(END_MARKER, endStart + END_MARKER.length) >= 0
  ) {
    return null;
  }
  const end = endStart + END_MARKER.length;
  return {
    start,
    end,
    separatorAdded: content.slice(start, end).includes(ADDED_SEPARATOR),
  };
}

function managedBlock(separatorAdded: boolean): string {
  return [
    START_MARKER,
    ...(separatorAdded ? [ADDED_SEPARATOR] : []),
    MANAGED_INSTRUCTIONS,
    END_MARKER,
  ].join("\n");
}

function installManagedBlock(content: string): Result<string> {
  const range = markerRange(content);
  if (range === null) {
    return {
      ok: false,
      exitCode: ExitCode.InvalidInput,
      diagnostics: [{
        code: "INVALID_SKILL_MARKERS",
        level: "error",
        message: "AGENTS.md contains incomplete or duplicate repo-graph markers.",
      }],
    };
  }
  if (range !== undefined) {
    return {
      ok: true,
      value: `${content.slice(0, range.start)}${managedBlock(range.separatorAdded)}${content.slice(range.end)}`,
      diagnostics: [],
    };
  }
  const separatorAdded = content.length > 0 && !content.endsWith("\n");
  return {
    ok: true,
    value: `${content}${separatorAdded ? "\n" : ""}${managedBlock(separatorAdded)}`,
    diagnostics: [],
  };
}

function uninstallManagedBlock(content: string): Result<string> {
  const range = markerRange(content);
  if (range === null) {
    return {
      ok: false,
      exitCode: ExitCode.InvalidInput,
      diagnostics: [{
        code: "INVALID_SKILL_MARKERS",
        level: "error",
        message: "AGENTS.md contains incomplete or duplicate repo-graph markers.",
      }],
    };
  }
  if (range === undefined) {
    return { ok: true, value: content, diagnostics: [] };
  }
  const prefixEnd = range.separatorAdded ? Math.max(0, range.start - 1) : range.start;
  return {
    ok: true,
    value: `${content.slice(0, prefixEnd)}${content.slice(range.end)}`,
    diagnostics: [],
  };
}

function withIgnoreEntry(content: string): string {
  const lines = content.split(/\r?\n/u);
  if (lines.includes(IGNORE_ENTRY)) return content;
  if (content.length === 0) return `${IGNORE_ENTRY}\n`;
  return `${content}${content.endsWith("\n") ? "" : "\n"}${IGNORE_ENTRY}\n`;
}

async function defaultWriteFile(file: string, content: string): Promise<void> {
  await writeFile(file, content, "utf8");
}

async function rollbackWrites(
  writes: readonly { file: string; before: string | undefined }[],
  createdDirectories: readonly string[],
): Promise<void> {
  let failed = false;
  for (const { file, before } of [...writes].reverse()) {
    try {
      if (before === undefined) {
        await rm(file, { force: true });
      } else {
        await defaultWriteFile(file, before);
      }
    } catch {
      failed = true;
    }
  }
  for (const directory of [...createdDirectories].reverse()) {
    try {
      await rmdir(directory);
    } catch {
      // Preserve directories that are no longer empty or cannot be removed safely.
    }
  }
  if (failed) throw new Error("skill install rollback failed");
}

export async function installProjectSkill(
  repo: LocalRepository,
  options: SkillInstallOptions = {},
): Promise<Result<SkillChange>> {
  if (!await isSafeRepository(repo)) {
    return invalidFailure(
      "INVALID_SKILL_REPOSITORY",
      "The agent skill must be installed in a resolved local repository.",
    );
  }

  const agentsFile = join(repo.root, "AGENTS.md");
  const ignoreFile = join(repo.root, ".gitignore");
  const skillFile = join(repo.root, SKILL_RELATIVE_PATH);
  const written: { file: string; before: string | undefined }[] = [];
  const createdDirectories: string[] = [];
  try {
    await Promise.all([
      assertSafeExistingPath(agentsFile, false),
      assertSafeExistingPath(ignoreFile, false),
    ]);
    const [agentsBefore, ignoreBefore, skill] = await Promise.all([
      readOptionalFile(agentsFile),
      readOptionalFile(ignoreFile),
      readFile(new URL("../../../assets/skill/SKILL.md", import.meta.url), "utf8"),
    ]);
    const agents = installManagedBlock(agentsBefore ?? "");
    if (!agents.ok) return agents;

    const directoryPaths = [
      join(repo.root, ".agents"),
      join(repo.root, ".agents", "skills"),
      join(repo.root, SKILL_DIRECTORY),
    ];
    for (const directory of directoryPaths) {
      try {
        await lstat(directory);
      } catch (error) {
        if (isMissing(error)) createdDirectories.push(directory);
        else throw error;
      }
    }
    const skillDirectory = await prepareSkillDirectory(repo.root);
    const canonicalSkillDirectory = await realpath(skillDirectory);
    if (relative(await realpath(repo.root), canonicalSkillDirectory) !== SKILL_DIRECTORY) {
      return failure(
        "SKILL_PATH_OUTSIDE_REPOSITORY",
        "The repository skill directory could not be validated safely.",
      );
    }
    await assertSafeExistingPath(skillFile, false);
    const skillBefore = await readOptionalFile(skillFile);
    const ignoreAfter = withIgnoreEntry(ignoreBefore ?? "");
    const changedPaths: string[] = [];
    const writer = options.writeFile ?? defaultWriteFile;
    const changes = [
      { file: ignoreFile, before: ignoreBefore, after: ignoreAfter, path: ".gitignore" },
      { file: skillFile, before: skillBefore, after: skill, path: SKILL_RELATIVE_PATH },
      { file: agentsFile, before: agentsBefore, after: agents.value, path: "AGENTS.md" },
    ];
    for (const change of changes) {
      if (change.before === change.after) continue;
      written.push({ file: change.file, before: change.before });
      await writer(change.file, change.after);
      changedPaths.push(change.path);
    }
    return {
      ok: true,
      value: { operation: "install", changed: changedPaths.length > 0, paths: changedPaths },
      diagnostics: [],
    };
  } catch {
    try {
      await rollbackWrites(written, createdDirectories);
    } catch {
      return failure(
        "SKILL_INSTALL_ROLLBACK_FAILED",
        "The repository-local agent skill could not be installed or rolled back safely.",
      );
    }
    return failure(
      "SKILL_INSTALL_FAILED",
      "The repository-local agent skill could not be installed safely.",
    );
  }
}

export async function uninstallProjectSkill(
  repo: LocalRepository,
): Promise<Result<SkillChange>> {
  if (!await isSafeRepository(repo)) {
    return invalidFailure(
      "INVALID_SKILL_REPOSITORY",
      "The agent skill must be removed from a resolved local repository.",
    );
  }

  const agentsFile = join(repo.root, "AGENTS.md");
  const skillDirectory = join(repo.root, SKILL_DIRECTORY);
  try {
    await Promise.all([
      assertSafeExistingPath(agentsFile, false),
      assertSafeExistingPath(join(repo.root, ".agents"), true),
      assertSafeExistingPath(join(repo.root, ".agents", "skills"), true),
      assertSafeExistingPath(skillDirectory, true),
    ]);
    const agentsBefore = await readOptionalFile(agentsFile);
    const agents = uninstallManagedBlock(agentsBefore ?? "");
    if (!agents.ok) return agents;

    const changedPaths: string[] = [];
    if (agentsBefore !== undefined && agentsBefore !== agents.value) {
      await defaultWriteFile(agentsFile, agents.value);
      changedPaths.push("AGENTS.md");
    }
    try {
      await lstat(skillDirectory);
      await rm(skillDirectory, { recursive: true });
      changedPaths.push(SKILL_DIRECTORY);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return {
      ok: true,
      value: { operation: "uninstall", changed: changedPaths.length > 0, paths: changedPaths },
      diagnostics: [],
    };
  } catch {
    return failure(
      "SKILL_UNINSTALL_FAILED",
      "The repository-local agent skill could not be removed safely.",
    );
  }
}
