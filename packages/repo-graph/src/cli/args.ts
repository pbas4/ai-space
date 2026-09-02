import { parseArgs } from "node:util";

import { ExitCode, type Result } from "../domain/diagnostic.js";

export type OutputFormat = "text" | "json";

export type CliArguments =
  | { command: "help" }
  | { command: "version" }
  | { command: "connect"; path: string; format: OutputFormat }
  | { command: "index"; path: string; format: OutputFormat }
  | { command: "update"; path: string; format: OutputFormat }
  | {
    command: "explain";
    selector: string;
    format: OutputFormat;
    budget: number;
  }
  | {
    command: "path";
    from: string;
    to: string;
    format: OutputFormat;
    budget: number;
  }
  | {
    command: "impact";
    selector: string;
    format: OutputFormat;
    budget: number;
    depth: number;
  };

function invalidArguments(message: string): Result<CliArguments> {
  return {
    ok: false,
    exitCode: ExitCode.InvalidInput,
    diagnostics: [
      { code: "INVALID_ARGUMENTS", level: "error", message },
    ],
  };
}

export function parseCliArgs(args: readonly string[]): Result<CliArguments> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        format: { type: "string" },
        budget: { type: "string" },
        depth: { type: "string" },
      },
    });
  } catch (error) {
    return invalidArguments(
      error instanceof Error ? error.message : "Command arguments are invalid.",
    );
  }

  if (parsed.values.help === true) {
    return { ok: true, value: { command: "help" }, diagnostics: [] };
  }
  if (parsed.values.version === true) {
    return { ok: true, value: { command: "version" }, diagnostics: [] };
  }

  const format = parsed.values.format ?? "text";
  if (format !== "text" && format !== "json") {
    return invalidArguments("The --format option must be text or json.");
  }
  const [command, ...positionals] = parsed.positionals;
  if (command === "connect" || command === "index" || command === "update") {
    if (positionals.length > 1) {
      return invalidArguments(`The ${command} command accepts at most one repository path.`);
    }
    if (parsed.values.budget !== undefined) {
      return invalidArguments(`The ${command} command does not accept --budget.`);
    }
    if (parsed.values.depth !== undefined) {
      return invalidArguments(`The ${command} command does not accept --depth.`);
    }
    return {
      ok: true,
      value: { command, path: positionals[0] ?? ".", format },
      diagnostics: [],
    };
  }

  if (
    parsed.values.budget !== undefined &&
    typeof parsed.values.budget !== "string"
  ) {
    return invalidArguments("The --budget option must be a positive integer.");
  }
  const budgetText = parsed.values.budget ?? "1500";
  const budget = Number(budgetText);
  if (!/^\d+$/u.test(budgetText) || !Number.isSafeInteger(budget) || budget < 1) {
    return invalidArguments("The --budget option must be a positive integer.");
  }
  if (command !== "impact" && parsed.values.depth !== undefined) {
    return invalidArguments("Only the impact command accepts --depth.");
  }
  if (
    parsed.values.depth !== undefined &&
    typeof parsed.values.depth !== "string"
  ) {
    return invalidArguments("The --depth option must be a positive integer.");
  }
  const depthText = parsed.values.depth ?? "3";
  const depth = Number(depthText);
  if (!/^\d+$/u.test(depthText) || !Number.isSafeInteger(depth) || depth < 1) {
    return invalidArguments("The --depth option must be a positive integer.");
  }
  if (command === "explain") {
    if (positionals.length !== 1) {
      return invalidArguments("The explain command requires exactly one selector.");
    }
    return {
      ok: true,
      value: { command, selector: positionals[0]!, format, budget },
      diagnostics: [],
    };
  }
  if (command === "path") {
    if (positionals.length !== 2) {
      return invalidArguments("The path command requires from and to selectors.");
    }
    return {
      ok: true,
      value: {
        command,
        from: positionals[0]!,
        to: positionals[1]!,
        format,
        budget,
      },
      diagnostics: [],
    };
  }

  if (command === "impact") {
    if (positionals.length !== 1) {
      return invalidArguments("The impact command requires exactly one selector.");
    }
    return {
      ok: true,
      value: {
        command,
        selector: positionals[0]!,
        format,
        budget,
        depth,
      },
      diagnostics: [],
    };
  }

  return invalidArguments("Expected the connect, index, update, explain, path, or impact command.");
}
