import { posix, win32 } from "node:path";

import { ExitCode, type Result } from "../domain/diagnostic.js";

export interface BenchmarkQuestion {
  enabled: boolean;
  question: string;
  repositoryPath: string;
  relevantFiles: string[];
  relevantSymbols: string[];
  naiveBaselineFiles: string[];
}

export interface ExpectedQuestionResult {
  relevantFiles: readonly string[];
  relevantSymbols?: readonly string[];
  naiveBaselineFiles: readonly string[];
}

export interface ActualQuestionResult {
  returnedFiles: readonly string[];
  returnedSymbols?: readonly string[];
  outputTokens: number;
  baselineTokens: number;
}

export interface QuestionScore {
  topTenHit: boolean;
  filePrecision: number;
  fileRecall: number;
  symbolPrecision: number;
  symbolRecall: number;
  precision: number;
  recall: number;
  outputTokens: number;
  baselineTokens: number;
  reductionRatio: number;
}

const REMOTE_SCHEMES = /^(?:https?|ssh|git|file|npm):/iu;
const SCP_STYLE = /^(?:[^/\\\s@:]+@)?[^/\\\s:]+:.+$/u;
const SCOPED_PACKAGE = /^@[^/\\\s]+\/[^/\\\s]+$/u;

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeFile(value: string): string {
  return posix.normalize(value.trim().replaceAll("\\", "/")).replace(/^\.\//u, "");
}

function metric(
  expectedValues: readonly string[],
  actualValues: readonly string[],
  normalize: (value: string) => string,
): { precision: number; recall: number; matches: number; returned: number; relevant: number } {
  const expected = new Set(expectedValues.map(normalize));
  const actual = [...new Set(actualValues.map(normalize))];
  const matches = actual.filter((value) => expected.has(value)).length;
  return {
    precision: actual.length === 0 ? (expected.size === 0 ? 1 : 0) : round(matches / actual.length),
    recall: expected.size === 0 ? 1 : round(matches / expected.size),
    matches,
    returned: actual.length,
    relevant: expected.size,
  };
}

export function scoreQuestion(
  expected: ExpectedQuestionResult,
  actual: ActualQuestionResult,
): QuestionScore {
  const relevantSymbols = expected.relevantSymbols ?? [];
  const returnedSymbols = actual.returnedSymbols ?? [];
  const files = metric(expected.relevantFiles, actual.returnedFiles, normalizeFile);
  const symbols = metric(relevantSymbols, returnedSymbols, (value) => value.trim());
  const matches = files.matches + symbols.matches;
  const returned = files.returned + symbols.returned;
  const relevant = files.relevant + symbols.relevant;
  const topFiles = new Set(actual.returnedFiles.slice(0, 10).map(normalizeFile));
  const topSymbols = new Set(returnedSymbols.slice(0, 10).map((value) => value.trim()));
  const topTenHit = expected.relevantFiles.some((value) => topFiles.has(normalizeFile(value))) ||
    relevantSymbols.some((value) => topSymbols.has(value.trim()));

  return {
    topTenHit,
    filePrecision: files.precision,
    fileRecall: files.recall,
    symbolPrecision: symbols.precision,
    symbolRecall: symbols.recall,
    precision: returned === 0 ? (relevant === 0 ? 1 : 0) : round(matches / returned),
    recall: relevant === 0 ? 1 : round(matches / relevant),
    outputTokens: actual.outputTokens,
    baselineTokens: actual.baselineTokens,
    reductionRatio: actual.outputTokens <= 0
      ? 0
      : round(actual.baselineTokens / actual.outputTokens),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isRemoteShaped(value: string): boolean {
  if (win32.isAbsolute(value)) return false;
  return REMOTE_SCHEMES.test(value) || SCP_STYLE.test(value) || SCOPED_PACKAGE.test(value);
}

function invalid(
  code: string,
  message: string,
): Result<BenchmarkQuestion[]> {
  return {
    ok: false,
    exitCode: ExitCode.InvalidInput,
    diagnostics: [{ code, level: "error", message }],
  };
}

export function validateBenchmarkQuestions(
  value: unknown,
): Result<BenchmarkQuestion[]> {
  if (!Array.isArray(value)) {
    return invalid("INVALID_BENCHMARK_SCHEMA", "Benchmark questions must be a JSON array.");
  }

  const questions: BenchmarkQuestion[] = [];
  for (const [index, candidate] of value.entries()) {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      return invalid(
        "INVALID_BENCHMARK_QUESTION",
        `Benchmark question ${index + 1} must be an object.`,
      );
    }
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.enabled !== "boolean" ||
      !isNonEmptyString(record.question) ||
      !isNonEmptyString(record.repositoryPath) ||
      !isStringArray(record.relevantFiles) ||
      !isStringArray(record.relevantSymbols) ||
      !isStringArray(record.naiveBaselineFiles)
    ) {
      return invalid(
        "INVALID_BENCHMARK_QUESTION",
        `Benchmark question ${index + 1} has missing or invalid fields.`,
      );
    }
    if (isRemoteShaped(record.repositoryPath)) {
      return invalid(
        "LOCAL_PATH_REQUIRED",
        `Benchmark question ${index + 1} must use an existing local repository path.`,
      );
    }
    if (
      record.enabled &&
      (record.relevantFiles.length + record.relevantSymbols.length === 0 ||
        record.naiveBaselineFiles.length === 0)
    ) {
      return invalid(
        "INVALID_BENCHMARK_QUESTION",
        `Enabled benchmark question ${index + 1} requires relevance labels and naïve baseline files.`,
      );
    }
    questions.push({
      enabled: record.enabled,
      question: record.question,
      repositoryPath: record.repositoryPath,
      relevantFiles: [...record.relevantFiles],
      relevantSymbols: [...record.relevantSymbols],
      naiveBaselineFiles: [...record.naiveBaselineFiles],
    });
  }
  return { ok: true, value: questions, diagnostics: [] };
}
