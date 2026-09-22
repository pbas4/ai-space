# React Vertical Slices Agent Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the reviewer a deterministic evidence-based verdict report and the migrator a deterministic readiness, execution, verification, and handoff workflow.

**Architecture:** Keep architecture decisions in the shared skill and keep the four client agent definitions as thin workflow contracts. Enforce semantic parity through Python contract tests and validate behavior through fresh-context scenarios before copying the Codex templates into Relations.

**Tech Stack:** Codex TOML agents, Claude Markdown/YAML agents, Python `unittest`, JSON plugin manifests, Markdown behavior scenarios.

## Global Constraints

- Preserve the existing shared `react-vertical-slices` architecture rules and explicit invocation policy.
- Preserve reviewer read-only tools and migrator workspace-write tools.
- Add no model override, dependency, external integration, permission expansion, script, absolute path, product-specific term, placeholder, or symlink.
- Keep Codex and Claude behavior contracts semantically equivalent.
- Bump both manifests and both catalog entries from `0.4.0` to `0.5.0`.
- Copy only the final Codex TOML definitions into Relations; do not change root selection rules, the local skill, product code, or Claude configuration there.
- Do not install the Claude CLI when unavailable.

---

### Task 1: Establish failing behavior contracts

**Files:**
- Modify: `packages/react-vertical-slices/tests/test_skill_contract.py`
- Modify: `packages/react-vertical-slices/tests/behavior-scenarios.md`
- Modify: `packages/react-vertical-slices/tests/behavior-results.md`

**Interfaces:**
- Consumes: current `0.4.0` agent definitions and recorded fresh-context samples
- Produces: failing contracts for reviewer evidence output and migrator readiness/handoff output

- [x] Add exact cross-client reviewer contract assertions for verdict semantics, mode-specific inspection, evidence, unverified claims, and the new report sections.
- [x] Add exact cross-client migrator assertions for readiness, authorization, baseline inspection, dirty-work overlap, verification failure, deferred debt, and reviewer handoff.
- [x] Add behavior scenarios VS-28 through VS-33 and record the `0.4.0` baseline: safety decisions `5/5`; reviewer and migrator output schemas `0/5`.
- [x] Change the expected package version to `0.5.0`.
- [x] Run `python3 -B -m unittest discover -s packages/react-vertical-slices/tests -v` and confirm failure against the current prompts and manifests.

### Task 2: Implement the shared cross-client agent contract

**Files:**
- Modify: `packages/react-vertical-slices/agents/react_vertical_slices_reviewer.toml`
- Modify: `packages/react-vertical-slices/agents/react_vertical_slices_migrator.toml`
- Modify: `packages/react-vertical-slices/agents/react-vertical-slices-reviewer.md`
- Modify: `packages/react-vertical-slices/agents/react-vertical-slices-migrator.md`
- Modify: `packages/react-vertical-slices/README.md`

**Interfaces:**
- Consumes: `react-vertical-slices` through Codex invocation or Claude preloading
- Produces: equivalent reviewer and migrator workflow contracts in both clients

- [x] Replace the reviewer output recipe with `Verdict`, `Evidence reviewed`, `Required findings`, `Non-blocking improvements`, `Existing debt`, `Unverified evidence`, and `Remaining risks`.
- [x] Define verdict semantics and separate plan-review from implementation-review evidence.
- [x] Add the migrator readiness gate, preflight baseline, overlap handling, exact verification reporting, deferred debt, and reviewer handoff.
- [x] State the shared instruction-versus-evidence boundary in both agents.
- [x] Keep the package README concise while documenting the new reports and handoff.
- [x] Run the package tests and confirm GREEN.

### Task 3: Release, forward-test, and mirror the Codex agents

**Files:**
- Modify: `packages/react-vertical-slices/.codex-plugin/plugin.json`
- Modify: `packages/react-vertical-slices/.claude-plugin/plugin.json`
- Modify: `.agents/plugins/marketplace.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `.codex/agents/react_vertical_slices_reviewer.toml` in Relations
- Modify: `.codex/agents/react_vertical_slices_migrator.toml` in Relations

**Interfaces:**
- Consumes: completed cross-client agent contract
- Produces: AI Space `0.5.0` and an independent Relations Codex copy

- [x] Update all four AI Space version declarations to `0.5.0` and review root/package summaries.
- [x] Repeat the schema and pressure scenarios in five fresh contexts and record actual results.
- [x] Copy the final Codex TOML prompts into Relations without adding a link to AI Space.
- [x] Run package tests, skill validator, plugin validator, catalog validator, forbidden-content/link checks, and `git diff --check`.
- [x] Validate the Relations TOML files, confirm they match the canonical Codex agents, and run `git diff --check`.
- [x] Run Claude validation only if the CLI is already available; otherwise record it as pending.
