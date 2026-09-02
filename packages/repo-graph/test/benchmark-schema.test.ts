import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  scoreQuestion,
  validateBenchmarkQuestions,
} from "../src/benchmark/score.js";

test("computes top-ten hit and token reduction without model calls", () => {
  const result = scoreQuestion(
    {
      relevantFiles: ["src/auth.ts"],
      relevantSymbols: [],
      naiveBaselineFiles: ["src/auth.ts", "src/api.ts"],
    },
    {
      returnedFiles: ["src/auth.ts"],
      returnedSymbols: [],
      outputTokens: 180,
      baselineTokens: 2_400,
    },
  );

  assert.equal(result.topTenHit, true);
  assert.equal(result.precision, 1);
  assert.equal(result.recall, 1);
  assert.equal(result.reductionRatio, 13.33);
});

test("scores file and symbol labels as distinct retrieval targets", () => {
  const result = scoreQuestion(
    {
      relevantFiles: ["src/auth.ts", "src/session.ts"],
      relevantSymbols: ["AuthService.login"],
      naiveBaselineFiles: ["src/auth.ts", "src/session.ts"],
    },
    {
      returnedFiles: ["src/auth.ts", "src/unrelated.ts"],
      returnedSymbols: ["AuthService.login"],
      outputTokens: 300,
      baselineTokens: 3_000,
    },
  );

  assert.equal(result.topTenHit, true);
  assert.equal(result.filePrecision, 0.5);
  assert.equal(result.fileRecall, 0.5);
  assert.equal(result.symbolPrecision, 1);
  assert.equal(result.symbolRecall, 1);
  assert.equal(result.precision, 0.67);
  assert.equal(result.recall, 0.67);
  assert.equal(result.reductionRatio, 10);
});

test("normalizes file aliases before removing duplicate retrievals", () => {
  const result = scoreQuestion(
    {
      relevantFiles: ["src/auth.ts"],
      naiveBaselineFiles: ["src/auth.ts"],
    },
    {
      returnedFiles: ["src/auth.ts", "./src/auth.ts", "src/unrelated.ts"],
      outputTokens: 100,
      baselineTokens: 1_000,
    },
  );

  assert.equal(result.filePrecision, 0.5);
  assert.equal(result.precision, 0.5);
});

test("benchmark report counts only extracted declaration nodes as returned symbols", async (t) => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "repo-graph-benchmark-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(join(repositoryRoot, "src"));
  await Promise.all([
    writeFile(
      join(repositoryRoot, "package.json"),
      `${JSON.stringify({ name: "benchmark-fixture", private: true }, null, 2)}\n`,
    ),
    writeFile(
      join(repositoryRoot, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      join(repositoryRoot, "src/index.ts"),
      "export const benchmarkTarget = 1;\n",
    ),
  ]);
  const questionsPath = join(repositoryRoot, "questions.json");
  await writeFile(
    questionsPath,
    `${JSON.stringify([
      {
        enabled: true,
        question: "benchmarkTarget",
        repositoryPath: repositoryRoot,
        relevantFiles: [],
        relevantSymbols: ["benchmarkTarget"],
        naiveBaselineFiles: ["src/index.ts"],
      },
    ], null, 2)}\n`,
  );

  const execution = spawnSync(
    process.execPath,
    [join(process.cwd(), "benchmark/run.mjs"), "--questions", questionsPath],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(execution.status, 0, execution.stderr);
  const report = JSON.parse(
    await readFile(
      join(repositoryRoot, ".repo-graph/benchmark/results.json"),
      "utf8",
    ),
  ) as {
    benchmarkVersion: number;
    summary: Record<string, unknown>;
    results: Array<{ returnedSymbols: string[]; symbolPrecision: number }>;
  };
  assert.equal(report.benchmarkVersion, 2);
  assert.equal(typeof report.summary.unchangedReuseTimeMs, "number");
  assert.equal(Object.hasOwn(report.summary, "updateTimeMs"), false);
  assert.deepEqual(report.results[0]?.returnedSymbols, ["benchmarkTarget"]);
  assert.equal(report.results[0]?.symbolPrecision, 1);
});

test("benchmark omits unchanged reuse timing when update rebuilds", async (t) => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "repo-graph-benchmark-rebuild-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  await mkdir(join(repositoryRoot, "src"));
  await Promise.all([
    writeFile(
      join(repositoryRoot, "package.json"),
      `${JSON.stringify({ name: "benchmark-rebuild-fixture", private: true }, null, 2)}\n`,
    ),
    writeFile(
      join(repositoryRoot, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    ),
    writeFile(
      join(repositoryRoot, "src/index.ts"),
      "export const benchmarkTarget: number = 'not a number';\n",
    ),
  ]);
  const questionsPath = join(repositoryRoot, "questions.json");
  await writeFile(
    questionsPath,
    `${JSON.stringify([{
      enabled: true,
      question: "benchmarkTarget",
      repositoryPath: repositoryRoot,
      relevantFiles: ["src/index.ts"],
      relevantSymbols: ["benchmarkTarget"],
      naiveBaselineFiles: ["src/index.ts"],
    }], null, 2)}\n`,
  );

  const execution = spawnSync(
    process.execPath,
    [join(process.cwd(), "benchmark/run.mjs"), "--questions", questionsPath],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(execution.status, 0, execution.stderr);
  const report = JSON.parse(
    await readFile(
      join(repositoryRoot, ".repo-graph/benchmark/results.json"),
      "utf8",
    ),
  ) as { summary: Record<string, unknown> };
  assert.equal(Object.hasOwn(report.summary, "unchangedReuseTimeMs"), false);
});

test("validates enabled labelled questions and disabled starter shapes", () => {
  const result = validateBenchmarkQuestions([
    {
      enabled: true,
      question: "How does authentication work?",
      repositoryPath: "/local/company/repository",
      relevantFiles: ["src/auth.ts"],
      relevantSymbols: ["AuthService"],
      naiveBaselineFiles: ["src/auth.ts", "src/api.ts"],
    },
    {
      enabled: false,
      question: "What breaks when a shared type changes?",
      repositoryPath: ".",
      relevantFiles: [],
      relevantSymbols: [],
      naiveBaselineFiles: [],
    },
  ]);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.length, 2);
});

test("rejects enabled questions without labels and remote repository inputs", () => {
  const unlabeled = validateBenchmarkQuestions([
    {
      enabled: true,
      question: "How does authentication work?",
      repositoryPath: ".",
      relevantFiles: [],
      relevantSymbols: [],
      naiveBaselineFiles: [],
    },
  ]);
  const remote = validateBenchmarkQuestions([
    {
      enabled: false,
      question: "How does authentication work?",
      repositoryPath: "https://example.com/company.git",
      relevantFiles: [],
      relevantSymbols: [],
      naiveBaselineFiles: [],
    },
  ]);

  assert.equal(unlabeled.ok, false);
  assert.equal(remote.ok, false);
  if (!unlabeled.ok) {
    assert.equal(unlabeled.diagnostics[0]?.code, "INVALID_BENCHMARK_QUESTION");
  }
  if (!remote.ok) {
    assert.equal(remote.diagnostics[0]?.code, "LOCAL_PATH_REQUIRED");
  }
});
