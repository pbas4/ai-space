#!/usr/bin/env node
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { scoreQuestion, validateBenchmarkQuestions } from "../dist/src/benchmark/score.js";
import {
  assertContainedPath,
  resolveLocalRepository,
} from "../dist/src/local/path-policy.js";
import { estimateTokens, selectRenderFacts } from "../dist/src/query/render.js";

const TOKEN_BUDGET = 1_500;
const DECLARATION_SYMBOL_KINDS = new Set([
  "class",
  "interface",
  "type_alias",
  "enum",
  "function",
  "method",
  "constructor",
  "variable",
  "constant",
  "property",
  "test",
]);

function usage() {
  return "Usage: node benchmark/run.mjs --questions <local-json-file>\n";
}

function parseArguments(args) {
  if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
    return { help: true };
  }
  if (args.length !== 2 || args[0] !== "--questions" || args[1].startsWith("-")) {
    throw new Error(usage().trim());
  }
  return { help: false, questionsPath: resolve(args[1]) };
}

function elapsed(start) {
  return Math.round((performance.now() - start) * 100) / 100;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mean(values) {
  if (values.length === 0) return 0;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : round((sorted[middle - 1] + sorted[middle]) / 2);
}

function unique(values) {
  return [...new Set(values)];
}

function summaryFor(scores, indexMetrics) {
  return {
    questions: scores.length,
    topTenHitRate: mean(scores.map((score) => Number(score.topTenHit))),
    precision: mean(scores.map((score) => score.precision)),
    recall: mean(scores.map((score) => score.recall)),
    medianOutputTokens: median(scores.map((score) => score.outputTokens)),
    medianBaselineTokens: median(scores.map((score) => score.baselineTokens)),
    medianReductionRatio: median(scores.map((score) => score.reductionRatio)),
    indexBytes: indexMetrics.indexBytes,
    indexTimeMs: indexMetrics.indexTimeMs,
    ...(indexMetrics.unchangedReuseTimeMs === undefined
      ? {}
      : { unchangedReuseTimeMs: indexMetrics.unchangedReuseTimeMs }),
    unresolvedEdgeRatio: indexMetrics.unresolvedEdgeRatio,
  };
}

function markdown(report) {
  const summary = report.summary;
  const rows = report.results.map((result) =>
    `| ${result.question.replaceAll("|", "\\|")} | ${result.topTenHit ? "yes" : "no"} | ${result.precision.toFixed(2)} | ${result.recall.toFixed(2)} | ${result.outputTokens} | ${result.baselineTokens} | ${result.reductionRatio.toFixed(2)}x |`
  );
  return [
    "# repo-graph benchmark results",
    "",
    "This report was produced entirely from a local repository. It contains retrieval labels and metrics, not source bodies.",
    "",
    "## Summary",
    "",
    `- Questions: ${summary.questions}`,
    `- Top-ten hit rate: ${(summary.topTenHitRate * 100).toFixed(2)}%`,
    `- Mean precision: ${summary.precision.toFixed(2)}`,
    `- Mean recall: ${summary.recall.toFixed(2)}`,
    `- Median output tokens: ${summary.medianOutputTokens}`,
    `- Median naïve baseline tokens: ${summary.medianBaselineTokens}`,
    `- Median reduction: ${summary.medianReductionRatio.toFixed(2)}x`,
    `- Index size: ${summary.indexBytes} bytes`,
    `- Index time: ${summary.indexTimeMs.toFixed(2)} ms`,
    summary.unchangedReuseTimeMs === undefined
      ? "- Unchanged index reuse time: not recorded (update rebuilt the index)"
      : `- Unchanged index reuse time: ${summary.unchangedReuseTimeMs.toFixed(2)} ms`,
    `- Unresolved-edge ratio: ${(summary.unresolvedEdgeRatio * 100).toFixed(2)}%`,
    "",
    "## Questions",
    "",
    "| Question | Top ten | Precision | Recall | Output tokens | Baseline tokens | Reduction |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows,
    "",
  ].join("\n");
}

async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function baselineTokens(repository, files) {
  const contents = [];
  for (const file of files) {
    const contained = await assertContainedPath(repository.root, file);
    if (!contained.ok) {
      throw new Error(`${file}: ${contained.diagnostics[0]?.message ?? "invalid baseline file"}`);
    }
    const fileStat = await stat(contained.value);
    if (!fileStat.isFile()) throw new Error(`${file}: baseline label must resolve to a file`);
    contents.push(await readFile(contained.value, "utf8"));
  }
  return estimateTokens(contents.join("\n"));
}

async function benchmarkRepository(repository, questions) {
  const [{ buildFullIndex }, { updateIndex }, { queryGraph }, { GraphDatabase }] = await Promise.all([
    import("../dist/src/indexer/full.js"),
    import("../dist/src/indexer/incremental.js"),
    import("../dist/src/query/search.js"),
    import("../dist/src/storage/database.js"),
  ]);
  const indexStart = performance.now();
  const indexed = await buildFullIndex(repository.root, { format: "json", cwd: repository.root });
  const indexTimeMs = elapsed(indexStart);
  if (!indexed.ok) {
    throw new Error(indexed.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"));
  }

  const reuseStart = performance.now();
  const updated = await updateIndex(repository.root, { format: "json", cwd: repository.root });
  if (!updated.ok) {
    throw new Error(updated.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"));
  }
  const unchangedReuseTimeMs = updated.value.reused
    ? elapsed(reuseStart)
    : undefined;

  const indexPath = join(repository.dataDir, "index.sqlite");
  const indexBytes = (await stat(indexPath)).size;
  const edges = indexed.value.edges;
  const unresolvedEdgeRatio = edges === 0 ? 0 : round(indexed.value.unresolvedEdges / edges);
  const database = new GraphDatabase();
  const opened = await database.openExisting(repository);
  if (!opened.ok) {
    throw new Error(opened.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"));
  }

  const results = [];
  for (const question of questions) {
    const query = await queryGraph(database, question.question, {
      format: "json",
      tokenBudget: TOKEN_BUDGET,
    });
    const rendered = selectRenderFacts(query, TOKEN_BUDGET);
    const nodes = [...rendered.seeds, ...rendered.nodes];
    const returnedFiles = unique(nodes.map((node) => node.sourceFile));
    const returnedSymbols = unique(
      nodes
        .filter((node) => DECLARATION_SYMBOL_KINDS.has(node.kind))
        .map((node) => node.qualifiedName),
    );
    const actual = {
      returnedFiles,
      returnedSymbols,
      outputTokens: estimateTokens(query.output),
      baselineTokens: await baselineTokens(repository, question.naiveBaselineFiles),
    };
    results.push({
      question: question.question,
      relevantFiles: question.relevantFiles,
      relevantSymbols: question.relevantSymbols,
      returnedFiles,
      returnedSymbols,
      ...scoreQuestion(question, actual),
    });
  }

  const summary = summaryFor(results, {
    indexBytes,
    indexTimeMs,
    unchangedReuseTimeMs,
    unresolvedEdgeRatio,
  });
  const report = { benchmarkVersion: 2, tokenBudget: TOKEN_BUDGET, summary, results };
  const outputDirectory = join(repository.dataDir, "benchmark");
  await writeAtomic(join(outputDirectory, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomic(join(outputDirectory, "results.md"), markdown(report));
  return { report, outputDirectory };
}

export async function main(args = process.argv.slice(2), io = console) {
  const parsed = parseArguments(args);
  if (parsed.help) {
    io.log(usage().trim());
    return 0;
  }
  const raw = JSON.parse(await readFile(parsed.questionsPath, "utf8"));
  const validated = validateBenchmarkQuestions(raw);
  if (!validated.ok) {
    throw new Error(validated.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"));
  }
  const enabled = validated.value.filter((question) => question.enabled);
  if (enabled.length === 0) {
    io.log("No benchmark questions are enabled. Add local company labels, then set enabled to true.");
    io.log("No network or model calls were made; no source content left this computer.");
    return 0;
  }

  const groups = new Map();
  for (const question of enabled) {
    const resolved = await resolveLocalRepository(question.repositoryPath, process.cwd());
    if (!resolved.ok) {
      throw new Error(resolved.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"));
    }
    const group = groups.get(resolved.value.root) ?? { repository: resolved.value, questions: [] };
    group.questions.push(question);
    groups.set(resolved.value.root, group);
  }

  for (const { repository, questions } of groups.values()) {
    const { report, outputDirectory } = await benchmarkRepository(repository, questions);
    io.log(`Benchmark: ${report.summary.questions} question(s), ${(report.summary.topTenHitRate * 100).toFixed(2)}% top-ten hit rate, ${report.summary.medianReductionRatio.toFixed(2)}x median reduction.`);
    io.log(`Local reports: ${outputDirectory}`);
  }
  io.log("No network or model calls were made; reports contain no source bodies.");
  return 0;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : "Benchmark failed unexpectedly.");
      process.exitCode = 1;
    },
  );
}
