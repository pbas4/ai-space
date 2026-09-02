#!/usr/bin/env node
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { parseCliArgs, type OutputFormat } from "./args.js";
import {
  ExitCode,
  type Diagnostic,
  type ExitCode as ExitCodeValue,
} from "../domain/diagnostic.js";
import type { IndexSummary } from "../indexer/full.js";

const TOOL_VERSION = "0.1.0";
const HELP = `Usage: repo-graph index [path] [--format text|json]
       repo-graph connect [path] [--format text|json]
       repo-graph update [path] [--format text|json]
       repo-graph query <question> [--budget 1500] [--format text|json]
       repo-graph explain <selector> [--budget 1500] [--format text|json]
       repo-graph path <from> <to> [--budget 1500] [--format text|json]
       repo-graph impact <selector> [--depth 3] [--budget 1500] [--format text|json]
       repo-graph status [path] [--format text|json]
       repo-graph doctor [path] [--format text|json]
       repo-graph stats [path] [--format text|json]
       repo-graph skill install [path]
       repo-graph skill uninstall [path]

Commands:
  connect [path]       Build/update the graph and install agent instructions
  index [path]        Atomically build a fresh repository-local graph index
  update [path]       Reuse an unchanged index; otherwise perform an atomic full rebuild
  query <question>    Search the indexed repository graph
  explain <selector> Explain an indexed symbol or file
  path <from> <to>   Find an evidence-bearing architectural path
  impact <selector>  Explain confirmed and uncertain reverse change impact
  status [path]       Report index freshness without rebuilding
  doctor [path]       Report extraction coverage and index health
  stats [path]        Report deterministic graph statistics
  skill install [path]
                      Install repository-local graph navigation instructions
  skill uninstall [path]
                      Remove repository-local graph navigation instructions

Global options:
  --format text|json  Select output format (default: text)
  --budget <tokens>   Set a positive token budget (default: 1500)
  --depth <hops>      Set a positive impact traversal depth (default: 3)
  -h, --help          Show help
  -v, --version       Show version
`;

type DiagnosticCommand = "status" | "doctor" | "stats";

interface SkillArguments {
  operation: "install" | "uninstall";
  path: string;
}

interface QueryArguments {
  question: string;
  format: OutputFormat;
  budget: number;
}

interface DiagnosticArguments {
  command: DiagnosticCommand;
  path: string;
  format: OutputFormat;
}

export interface CliIo {
  cwd: string;
  stdout(value: string): void;
  stderr(value: string): void;
}

function defaultIo(): CliIo {
  return {
    cwd: process.cwd(),
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  };
}

function sanitize(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ");
}

function renderDiagnostics(
  diagnostics: readonly Diagnostic[],
  write: (value: string) => void,
): void {
  for (const diagnostic of diagnostics) {
    const location = diagnostic.file === undefined ? "" : `${diagnostic.file}: `;
    write(sanitize(`${location}${diagnostic.code}: ${diagnostic.message}`) + "\n");
  }
}

function renderSummary(summary: IndexSummary, format: OutputFormat): string {
  if (format === "json") return `${JSON.stringify(summary, null, 2)}\n`;
  return [
    `Repository: ${sanitize(summary.repository)}`,
    `Projects: ${summary.projects}`,
    `Files: ${summary.files}`,
    `Nodes: ${summary.nodes}`,
    `Edges: ${summary.edges}`,
    `Resolved edges: ${summary.resolvedEdges}`,
    `Unresolved edges: ${summary.unresolvedEdges}`,
    `Diagnostics: ${summary.diagnostics}`,
    `Database: ${summary.database}`,
    "",
  ].join("\n");
}

function renderConnectSummary(summary: {
  repository: { root: string };
  index: IndexSummary & { reused: boolean };
  skill: { paths: string[] };
  reused: boolean;
}, format: OutputFormat): string {
  if (format === "json") return `${JSON.stringify(summary, null, 2)}\n`;
  return [
    `Connected repository: ${sanitize(summary.repository.root)}`,
    `Index: ${summary.index.reused ? "reused" : "created"}`,
    `Graph skill: ${summary.skill.paths.length > 0 ? "installed" : "already installed"}`,
    `Reused: ${summary.reused}`,
    "",
  ].join("\n");
}

function invalidDiagnosticArguments(message: string): {
  ok: false;
  diagnostic: Diagnostic;
} {
  return {
    ok: false,
    diagnostic: { code: "INVALID_ARGUMENTS", level: "error", message },
  };
}

function parseSkillArguments(args: readonly string[]):
  | { ok: true; value: SkillArguments }
  | { ok: false; diagnostic: Diagnostic }
  | undefined {
  if (args[0] !== "skill") return undefined;
  const operation = args[1];
  if (operation !== "install" && operation !== "uninstall") {
    return invalidDiagnosticArguments(
      "The skill command requires install or uninstall.",
    );
  }
  if (args.length > 3) {
    return invalidDiagnosticArguments(
      `The skill ${operation} command accepts at most one repository path.`,
    );
  }
  const path = args[2] ?? ".";
  if (path.startsWith("-")) {
    return invalidDiagnosticArguments(`Unknown option '${path}'.`);
  }
  return { ok: true, value: { operation, path } };
}

function parseQueryArguments(args: readonly string[]):
  | { ok: true; value: QueryArguments }
  | { ok: false; diagnostic: Diagnostic }
  | undefined {
  if (args[0] !== "query") return undefined;
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...args.slice(1)],
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: "string" },
        budget: { type: "string" },
      },
    });
  } catch (error) {
    return invalidDiagnosticArguments(
      error instanceof Error ? error.message : "Query arguments are invalid.",
    );
  }
  if (parsed.positionals.length !== 1) {
    return invalidDiagnosticArguments(
      "The query command requires exactly one question.",
    );
  }
  const format = parsed.values.format ?? "text";
  if (format !== "text" && format !== "json") {
    return invalidDiagnosticArguments("The --format option must be text or json.");
  }
  if (
    parsed.values.budget !== undefined &&
    typeof parsed.values.budget !== "string"
  ) {
    return invalidDiagnosticArguments(
      "The --budget option must be a positive integer.",
    );
  }
  const budgetText = parsed.values.budget ?? "1500";
  const budget = Number(budgetText);
  if (!/^\d+$/u.test(budgetText) || !Number.isSafeInteger(budget) || budget < 1) {
    return invalidDiagnosticArguments(
      "The --budget option must be a positive integer.",
    );
  }
  return {
    ok: true,
    value: { question: parsed.positionals[0]!, format, budget },
  };
}

function parseDiagnosticArguments(args: readonly string[]):
  | { ok: true; value: DiagnosticArguments }
  | { ok: false; diagnostic: Diagnostic }
  | undefined {
  const command = args[0];
  if (command !== "status" && command !== "doctor" && command !== "stats") {
    return undefined;
  }
  const positionals: string[] = [];
  let format: OutputFormat = "text";
  for (let index = 1; index < args.length; index += 1) {
    const value = args[index]!;
    if (value === "--format") {
      const selected = args[index + 1];
      if (selected === undefined) {
        return invalidDiagnosticArguments(
          "The --format option requires text or json.",
        );
      }
      if (selected !== "text" && selected !== "json") {
        return invalidDiagnosticArguments("The --format option must be text or json.");
      }
      format = selected;
      index += 1;
      continue;
    }
    if (value.startsWith("--format=")) {
      const selected = value.slice("--format=".length);
      if (selected !== "text" && selected !== "json") {
        return invalidDiagnosticArguments("The --format option must be text or json.");
      }
      format = selected;
      continue;
    }
    if (value.startsWith("-")) {
      return invalidDiagnosticArguments(`Unknown option '${value}'.`);
    }
    positionals.push(value);
  }
  if (positionals.length > 1) {
    return invalidDiagnosticArguments(
      `The ${command} command accepts at most one repository path.`,
    );
  }
  return {
    ok: true,
    value: { command, path: positionals[0] ?? ".", format },
  };
}

function renderObject(
  value: Readonly<Record<string, unknown>>,
  format: OutputFormat,
): string {
  if (format === "json") return `${JSON.stringify(value, null, 2)}\n`;
  const lines: string[] = [];
  const label = (prefix: string): string => {
    const words = prefix
      .replaceAll(".", " ")
      .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
      .toLowerCase();
    return words.length === 0 ? words : `${words[0]!.toUpperCase()}${words.slice(1)}`;
  };
  const visit = (prefix: string, item: unknown): void => {
    if (Array.isArray(item)) {
      lines.push(
        `${label(prefix)}: ${item.length === 0 ? "none" : JSON.stringify(item)}`,
      );
      return;
    }
    if (item !== null && typeof item === "object") {
      for (const [key, nested] of Object.entries(item)) {
        visit(prefix === "" ? key : `${prefix}.${key}`, nested);
      }
      return;
    }
    lines.push(`${label(prefix)}: ${String(item)}`);
  };
  for (const [key, item] of Object.entries(value)) visit(key, item);
  return `${lines.map(sanitize).join("\n")}\n`;
}

function diagnosticExitCode(state: string): ExitCodeValue {
  if (state === "current") return ExitCode.Ok;
  if (state === "corrupt") return ExitCode.InternalFailure;
  return ExitCode.MissingOrStaleIndex;
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  io: CliIo = defaultIo(),
): Promise<ExitCodeValue> {
  try {
    if (
      (args[0] === "skill" || args[0] === "query") &&
      args.slice(1).some((value) => value === "-h" || value === "--help")
    ) {
      io.stdout(HELP);
      return ExitCode.Ok;
    }
    if (
      (args[0] === "skill" || args[0] === "query") &&
      args.slice(1).some((value) => value === "-v" || value === "--version")
    ) {
      io.stdout(`${TOOL_VERSION}\n`);
      return ExitCode.Ok;
    }
    if (
      (args[0] === "status" || args[0] === "doctor" || args[0] === "stats") &&
      args.slice(1).some((value) => value === "-h" || value === "--help")
    ) {
      io.stdout(HELP);
      return ExitCode.Ok;
    }
    if (
      (args[0] === "status" || args[0] === "doctor" || args[0] === "stats") &&
      args.slice(1).some((value) => value === "-v" || value === "--version")
    ) {
      io.stdout(`${TOOL_VERSION}\n`);
      return ExitCode.Ok;
    }
    const query = parseQueryArguments(args);
    if (query !== undefined) {
      if (!query.ok) {
        renderDiagnostics([query.diagnostic], io.stderr);
        return ExitCode.InvalidInput;
      }
      const { resolveLocalRepository } = await import("../local/path-policy.js");
      const repository = await resolveLocalRepository(".", io.cwd);
      if (!repository.ok) {
        renderDiagnostics(repository.diagnostics, io.stderr);
        return repository.exitCode;
      }
      const { GraphDatabase } = await import("../storage/database.js");
      const database = new GraphDatabase();
      const opened = await database.openExisting(repository.value);
      if (!opened.ok) {
        renderDiagnostics(opened.diagnostics, io.stderr);
        return opened.exitCode;
      }
      const { queryGraph } = await import("../query/search.js");
      const result = await queryGraph(database, query.value.question, {
        format: query.value.format,
        tokenBudget: query.value.budget,
      });
      io.stdout(result.output);
      return ExitCode.Ok;
    }
    const skill = parseSkillArguments(args);
    if (skill !== undefined) {
      if (!skill.ok) {
        renderDiagnostics([skill.diagnostic], io.stderr);
        return ExitCode.InvalidInput;
      }
      const { resolveLocalRepository } = await import("../local/path-policy.js");
      const repository = await resolveLocalRepository(skill.value.path, io.cwd);
      if (!repository.ok) {
        renderDiagnostics(repository.diagnostics, io.stderr);
        return repository.exitCode;
      }
      const { installProjectSkill, uninstallProjectSkill } = await import(
        "../skill/install.js"
      );
      const result = skill.value.operation === "install"
        ? await installProjectSkill(repository.value)
        : await uninstallProjectSkill(repository.value);
      if (!result.ok) {
        renderDiagnostics(result.diagnostics, io.stderr);
        return result.exitCode;
      }
      const verb = skill.value.operation === "install" ? "installed" : "uninstalled";
      io.stdout(
        result.value.changed
          ? `Repository agent skill ${verb}.\n`
          : `Repository agent skill already ${verb}.\n`,
      );
      return ExitCode.Ok;
    }
    const diagnostic = parseDiagnosticArguments(args);
    if (diagnostic !== undefined) {
      if (!diagnostic.ok) {
        renderDiagnostics([diagnostic.diagnostic], io.stderr);
        return ExitCode.InvalidInput;
      }
      const { command, path, format } = diagnostic.value;
      let value: Readonly<Record<string, unknown>>;
      if (command === "status") {
        const { getStatus } = await import("../commands/status.js");
        value = await getStatus(path, io.cwd) as unknown as Readonly<
          Record<string, unknown>
        >;
      } else if (command === "doctor") {
        const { runDoctor } = await import("../commands/doctor.js");
        value = await runDoctor(path, io.cwd) as unknown as Readonly<
          Record<string, unknown>
        >;
      } else {
        const { getStats } = await import("../commands/stats.js");
        value = await getStats(path, io.cwd) as unknown as Readonly<
          Record<string, unknown>
        >;
      }
      io.stdout(renderObject(value, format));
      return diagnosticExitCode(String(value.state));
    }
    const parsed = parseCliArgs(args);
    if (!parsed.ok) {
      renderDiagnostics(parsed.diagnostics, io.stderr);
      return parsed.exitCode;
    }
    if (parsed.value.command === "help") {
      io.stdout(HELP);
      return ExitCode.Ok;
    }
    if (parsed.value.command === "version") {
      io.stdout(`${TOOL_VERSION}\n`);
      return ExitCode.Ok;
    }

    if (parsed.value.command === "connect") {
      const { connectRepository } = await import("../commands/connect.js");
      const result = await connectRepository(parsed.value.path, io.cwd);
      if (!result.ok) {
        renderDiagnostics(result.diagnostics, io.stderr);
        return result.exitCode;
      }
      io.stdout(renderConnectSummary(result.value, parsed.value.format));
      renderDiagnostics(result.diagnostics, io.stderr);
      return result.diagnostics.some((diagnostic) => diagnostic.level !== "info")
        ? ExitCode.PartialExtraction
        : ExitCode.Ok;
    }

    if (parsed.value.command !== "index" && parsed.value.command !== "update") {
      const { resolveLocalRepository } = await import("../local/path-policy.js");
      const repository = await resolveLocalRepository(".", io.cwd);
      if (!repository.ok) {
        renderDiagnostics(repository.diagnostics, io.stderr);
        return repository.exitCode;
      }
      const { GraphDatabase } = await import("../storage/database.js");
      const database = new GraphDatabase();
      const opened = await database.openExisting(repository.value);
      if (!opened.ok) {
        renderDiagnostics(opened.diagnostics, io.stderr);
        return opened.exitCode;
      }
      if (parsed.value.command === "explain") {
        const [{ explainNode }, { renderSubgraph }] = await Promise.all([
          import("../query/explain.js"),
          import("../query/render.js"),
        ]);
        const result = await explainNode(
          database,
          parsed.value.selector,
          parsed.value.budget,
        );
        if (!result.ok) {
          renderDiagnostics(result.diagnostics, io.stderr);
          return result.exitCode;
        }
        io.stdout(renderSubgraph(result.value, {
          format: parsed.value.format,
          tokenBudget: parsed.value.budget,
        }));
        renderDiagnostics(result.diagnostics, io.stderr);
        return ExitCode.Ok;
      }
      if (parsed.value.command === "impact") {
        const { analyzeImpact, renderImpactReport } = await import(
          "../query/impact.js"
        );
        const result = await analyzeImpact(database, parsed.value.selector, {
          depth: parsed.value.depth,
          tokenBudget: parsed.value.budget,
        });
        if (!result.ok) {
          renderDiagnostics(result.diagnostics, io.stderr);
          return result.exitCode;
        }
        io.stdout(renderImpactReport(
          result.value,
          parsed.value.format,
          parsed.value.budget,
        ));
        renderDiagnostics(result.diagnostics, io.stderr);
        return ExitCode.Ok;
      }
      const { shortestPath, renderExplainedPath } = await import(
        "../query/path.js"
      );
      const result = await shortestPath(
        database,
        parsed.value.from,
        parsed.value.to,
        parsed.value.budget,
      );
      if (!result.ok) {
        renderDiagnostics(result.diagnostics, io.stderr);
        return result.exitCode;
      }
      io.stdout(renderExplainedPath(
        result.value,
        parsed.value.format,
        parsed.value.budget,
      ));
      renderDiagnostics(result.diagnostics, io.stderr);
      return ExitCode.Ok;
    }

    const options = { format: parsed.value.format, cwd: io.cwd };
    const result = parsed.value.command === "index"
      ? await (await import("../indexer/full.js")).buildFullIndex(
        parsed.value.path,
        options,
      )
      : await (await import("../indexer/incremental.js")).updateIndex(
        parsed.value.path,
        options,
      );
    if (!result.ok) {
      renderDiagnostics(result.diagnostics, io.stderr);
      return result.exitCode;
    }
    io.stdout(renderSummary(result.value, parsed.value.format));
    renderDiagnostics(result.diagnostics, io.stderr);
    return result.diagnostics.some((diagnostic) => diagnostic.level !== "info")
      ? ExitCode.PartialExtraction
      : ExitCode.Ok;
  } catch (error) {
    const { DiagnosticCommandError } = await import("../commands/status.js");
    if (error instanceof DiagnosticCommandError) {
      renderDiagnostics(error.diagnostics, io.stderr);
      return error.exitCode;
    }
    renderDiagnostics(
      [
        {
          code: "INTERNAL_FAILURE",
          level: "error",
          message: "The command failed unexpectedly.",
        },
      ],
      io.stderr,
    );
    return ExitCode.InternalFailure;
  }
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(await realpath(entryPath)).href
) {
  process.exitCode = await main();
}
