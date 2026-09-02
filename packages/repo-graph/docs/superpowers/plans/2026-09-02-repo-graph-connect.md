# Repository Graph Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Codex and other coding agents a one-time `repo-graph connect` setup that builds or refreshes the local graph and installs portable repository instructions.

**Architecture:** Add a thin command orchestrator that resolves one local repository, calls the existing safe `updateIndex` and `installProjectSkill` operations, and reports both outcomes. Keep advanced graph commands unchanged; the installed skill tells agents to use the graph automatically and treats source as authoritative.

**Tech Stack:** TypeScript, Node.js built-ins, existing SQLite/indexer/storage/skill modules, Node test runner.

## Global Constraints

- Filesystem-local repositories only; reject URLs, Git targets, and package coordinates.
- Offline operation only; no network, Git commands, package managers, child processes, or target-repository code execution.
- No new runtime or development dependencies.
- Preserve atomic index writes, bounded query budgets, diagnostics, and unrelated repository instructions.
- Do not begin Task 7 or alter the existing graph model.

---

### Task 1: Add the connect orchestration API

**Files:**
- Create: `src/commands/connect.ts`
- Test: `test/connect.test.ts`

**Interfaces:**
- Consumes `updateIndex(inputPath, { format: "json", cwd })` and `installProjectSkill(repository)`.
- Produces `connectRepository(inputPath, cwd): Promise<Result<ConnectSummary>>`.

- [ ] Write a failing test covering a fresh local fixture: the index is created, the repository skill and `AGENTS.md` marker are installed, and the summary reports `reused: false` plus changed paths.
- [ ] Run `npm test`; the new test must fail because `connectRepository` is absent.
- [ ] Implement `ConnectSummary` with `repository`, `index`, `skill`, and `reused` fields. Resolve the repository once, update the index with JSON output, install the skill against that resolved repository, and return the combined summary. Propagate existing `Result` diagnostics and exit codes; never shell out.
- [ ] Add tests for a second connect (reuses the unchanged index and makes no skill changes) and for a missing/unresolvable local path.
- [ ] Run `npm test` and inspect the diff against the offline constraints.
- [ ] Commit: `feat: add repository connect orchestration`.

### Task 2: Expose the single setup command

**Files:**
- Modify: `src/cli/args.ts`
- Modify: `src/cli/main.ts`
- Test: `test/cli-index.test.ts`

**Interfaces:**
- Adds `{ command: "connect"; path: string; format: OutputFormat }` to `CliArguments`.
- Accepts `repo-graph connect [path] [--format text|json]`.

- [ ] Add parser tests for the default path, explicit path, JSON output, and rejection of `--budget`, `--depth`, or multiple paths.
- [ ] Run the focused parser/CLI tests; they must fail before implementation.
- [ ] Add `connect` to help text and dispatch it before index/update. Render a concise text summary (`Connected repository`, `Index`, `Graph skill`, `Reused`) and preserve structured JSON output. Return the command’s existing diagnostic exit codes.
- [ ] Add an end-to-end CLI test proving the command creates `.repo-graph/index.sqlite`, `.agents/skills/repo-graph/SKILL.md`, `AGENTS.md`, and `.gitignore` in a fixture without changing source files.
- [ ] Run the focused tests, then `npm test`, `npm run check:offline`, and `git diff --check`.
- [ ] Commit: `feat: expose repository connect command`.

### Task 3: Make the installed skill agent-native

**Files:**
- Modify: `assets/skill/SKILL.md`
- Modify: `skills/repo-graph/SKILL.md`
- Modify: `README.md`
- Modify: `.codex-plugin/plugin.json`
- Test: `test/skill-install.test.ts`

**Interfaces:**
- The CLI-installed and plugin-bundled skill files remain byte-identical.

- [ ] Add a failing contract assertion that both skill copies explain the normal workflow as “connect once, then ask the agent normally,” while retaining status/update fallback and source inspection requirements.
- [ ] Run the focused skill test; it must fail before the copy is updated.
- [ ] Update both skill copies with the concise agent workflow: verify freshness silently, use bounded graph navigation internally, read source spans before conclusions/edits, and fall back to local search when coverage is incomplete. Keep the low-level commands as implementation details.
- [ ] Update README and manifest starter prompts to advertise `repo-graph connect` and natural-language agent questions.
- [ ] Run `npm test`, plugin validation, `npm run check:offline`, `npm run pack:offline`, and `git diff --check`.
- [ ] Commit: `docs: simplify repository graph agent onboarding`.

### Task 4: Package and push the simplified plugin

**Files:**
- Modify: `docs/superpowers/plans/2026-09-02-repo-graph-connect.md`

- [ ] Review all three commits against the design and confirm generated `node_modules`, `dist`, tarballs, and nested `.git` directories are absent from the package.
- [ ] Run the full verification suite and `python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .` from the package directory.
- [ ] Copy the completed package into `packages/repo-graph/` in the existing `ai-space` branch, preserve unrelated changes, commit the sync, and push the feature branch. Do not merge `main` or start Task 7.

