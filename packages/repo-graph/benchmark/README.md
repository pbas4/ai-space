# Local retrieval and token benchmark

This benchmark measures whether repo-graph retrieves human-labelled files and symbols while returning substantially less context than a labelled naïve-file baseline. It runs the production indexer, query engine, and token estimator directly. It makes no network or model calls and does not copy source bodies into its reports.

## Label company questions

`questions.json` contains five disabled starter shapes. For each useful company example:

1. Set `repositoryPath` to an existing local repository directory. Relative paths are resolved from the directory where the runner is invoked; URLs, Git targets, and package coordinates are rejected.
2. Replace `question` with a representative question.
3. Add repository-relative paths to `relevantFiles` and exact indexed qualified names to `relevantSymbols`.
4. List the source files a naïve investigation would have loaded in `naiveBaselineFiles`.
5. Set `enabled` to `true` only after relevance and baseline labels are complete.

Disabled entries may keep empty label arrays. Enabled entries require at least one relevant file or symbol and at least one naïve baseline file.

## Run

From the repo-graph package directory:

```text
npm run build
node benchmark/run.mjs --questions benchmark/questions.json
```

When no questions are enabled, the runner exits successfully and explains how to supply local labels. For enabled questions it performs a fresh atomic index build, attempts unchanged-index reuse, executes queries with a 1,500-token budget, and writes:

```text
<repository>/.repo-graph/benchmark/results.json
<repository>/.repo-graph/benchmark/results.md
```

The reports include top-ten hit rate, file-and-symbol retrieval precision and recall, median output and baseline tokens, median reduction ratio, index size and time, and unresolved-edge ratio. They include unchanged-index reuse time only when `repo-graph update` confirms that it reused the complete index; if update performs a safe atomic full rebuild, no reuse timing is recorded. Timing naturally varies between machines; retrieval and token results are deterministic for an unchanged repository and tool version.

The approved acceptance thresholds are at least 80% top-ten success, fewer than 2,000 median output tokens, and at least 10x median reduction against the labelled naïve-file baseline.
