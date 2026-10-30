# Retro Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved reusable retrospective skill and all three agents for Codex and Claude Code.

**Architecture:** A shared skill coordinates three sequential specialists. Shared role references define handoff contracts; client-specific agent wrappers load only their role and never recursively orchestrate. Executable checks demonstrate enforcement but do not pretend to automate model judgment.

**Tech Stack:** Markdown, YAML, TOML, JSON, Python standard-library unittest, Node.js marketplace validation.

## Global Constraints

- Implement the approved spec at `docs/superpowers/specs/2026-10-30-retro-plugin-design.md`.
- Initial version: `0.1.0`, synchronized between both manifests and both marketplaces.
- Include exactly three independently callable agents: interviewer, rule designer, verifier.
- Never create commits, change persistent configuration, install personal agent copies, or add hooks.
- Respect existing implementation authorization; a retrospective-only request does not authorize implementation.
- Preserve current checkout and existing unrelated work. No worktree requested; use the suitable current checkout.
- Do not claim independent runtime verification from static contract checks.
- Codex custom agents use supported fields; omit `sandbox_mode` and `approval_policy`, which do not override parent permissions.

---

### Task 1: Complete three-agent plugin and distribution

This is one reviewable deliverable: the shared workflow, agent wrappers, examples,
and packaging must agree for the plugin to be usable. Execute the phases below
in order, verifying each before the final review.

**Files to create:**

- `packages/retro/.codex-plugin/plugin.json`
- `packages/retro/.claude-plugin/plugin.json`
- `packages/retro/skills/retro/SKILL.md`
- `packages/retro/skills/retro/agents/openai.yaml`
- `packages/retro/skills/retro/references/roles.md`
- `packages/retro/skills/retro/references/report-template.md`
- `packages/retro/agents/retro_interviewer.toml`
- `packages/retro/agents/retro_rule_designer.toml`
- `packages/retro/agents/retro_verifier.toml`
- `packages/retro/agents/retro-interviewer.md`
- `packages/retro/agents/retro-rule-designer.md`
- `packages/retro/agents/retro-verifier.md`
- `packages/retro/examples/check-plugin-versions.mjs`
- `packages/retro/tests/test_plugin.py`
- `packages/retro/tests/behavior-scenarios.md`
- `packages/retro/README.md`
- `.agents/plugins/plugins/retro` (relative symlink to `../../../packages/retro`)

**Files to modify:**

- `.agents/plugins/marketplace.json`
- `.claude-plugin/marketplace.json`
- `scripts/validate-marketplaces.mjs` (include retro; validate its manifests/alias)
- `README.md` and `packages/README.md` (installation, capabilities, project list)
- Approved spec status and this plan's execution ledger after verification.

**Interfaces:**

- Coordinator supplies repository, available session evidence, scope/mode,
  authorization, findings and IDs, proposals, and commands/output to specialists.
- Interviewer returns questions and evidence-backed findings; designer returns
  proposals or authorized changes; verifier returns exactly one verdict with
  evidence and unverified claims. Full fields live in the shared role reference.
- Example CLI: `node examples/check-plugin-versions.mjs <package-directory>`.
  Exit 0 for matching valid manifest versions; exit 1 with diagnostic for drift,
  invalid versions, missing manifests, or invalid JSON. Omitted argument gives usage
  and a nonzero exit. It checks only two package manifests; it does not claim to
  check marketplace entries. It never edits files.

- [x] **Phase 1: Baseline and failing checks.** Capture a read-only no-skill
  retrospective scenario. Before implementation, write meaningful contract
  tests for complete packaging/client parsing, shared references, distinct role
  responsibilities and tool access, synchronized versions/marketplaces/alias,
  and subprocess tests of the example CLI. Use temporary fixture directories:

  ```python
  for host in (".codex-plugin", ".claude-plugin"):
      (fixture / host).mkdir()
      (fixture / host / "plugin.json").write_text(
          json.dumps({"name": "demo", "version": "0.1.0"}))
  result = subprocess.run(["node", str(check), str(fixture)], capture_output=True, text=True)
  self.assertEqual(result.returncode, 0, result.stderr)
  ```

  Run `python3 -m unittest discover -s packages/retro/tests -v`; confirm failures
  identify absent deliverables rather than test syntax errors.

- [x] **Phase 2: Skill, roles, and wrappers.** Write the shared workflow and
  output contracts from the approved spec. Claude wrappers preload `retro`;
  Codex wrappers invoke `$retro` in specialist mode and resolve its role reference
  through the skill's installed location rather than copied-file relative paths.
  Keep substantive role instructions shared. Claude interviewer tools are Read,
  Grep, Glob; designer additionally Edit, Write, Bash; verifier additionally Bash
  for known checks. Codex wrappers describe these boundaries without claiming
  tool-level filesystem isolation. All wrappers prohibit redelegation. No model
  is pinned. Keep the default skill explicit-only as approved in the spec.

- [x] **Phase 3: Example and distribution.** Implement the CLI above with
  standard Node imports, fail on malformed/missing version inputs, and print
  the checked paths and outcome. Add v0.1.0 manifests and skill UI metadata.
  Register both marketplaces and the alias, update the validator's expected
  names, and document all installation/invocation commands and limitations.
  Review both existing README indexes; update only relevant listings.

- [x] **Phase 4: Verification and review.** Run package tests, skill validation,
  Claude plugin validation, marketplace validation, and whitespace checks. Attempt
  the exact required plugin validator; if unavailable after locating alternatives,
  report that limitation rather than inventing a pass. Exercise with-skill pressure
  scenarios through fresh agents and record the actual outcomes separately from
  static checks. Independent review covers spec compliance and quality. Correct
  in-scope findings and rerun the covering checks.

## Execution ledger

- Spec approved by user: 2026-10-30, “go ahead”.
- Baseline: existing marketplace validation passed before implementation.
- Worktree: no attached worktree; reuse the current suitable checkout, consistent with the app's default.
- Commit: not authorized; do not commit or stage.
- Task 1: complete; 13 package tests, marketplace checks, CLI,
  skill validation, recovered official plugin validation, Claude manifest
  validation, and whitespace checks passed. Fresh-context role/coordinator
  evaluations are recorded in `packages/retro/tests/behavior-results.md`.
  Independent final spec compliance and quality review approved after one
  naming-collision fix wave. Claude skill preloads and coordinator agent names
  are fully qualified; regression assertions and covering checks passed.
- Environment: the configured original plugin-validator path is missing; the
  same official validator was recovered from the revision before removal and
  passed from temporary storage. No Codex installation was changed.
- Claude strict validation also passed for the agents and skills component
  directories. Native installation, discovery, and runtime preloading were not
  tested. No commit, staging, or publication was performed.
