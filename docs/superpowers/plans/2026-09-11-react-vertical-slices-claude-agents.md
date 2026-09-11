# React Vertical Slices Claude Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Claude Code reviewer and migrator agents to the existing cross-client React vertical slices package.

**Architecture:** Keep the shared architecture guidance in the existing skill and add two thin Claude Markdown wrappers beside the Codex TOML templates. Contract tests enforce equivalent behavior across both clients while allowing each client to use its native naming, tools, and packaging format.

**Tech Stack:** Claude Code plugin Markdown/YAML agents, Codex TOML agents, Python `unittest`, JSON plugin manifests.

## Global Constraints

- Work only in the `ai-space` repository on `codex/react-vertical-slices-claude-agents`.
- Keep the branch stacked on `codex/react-vertical-slices-agents`.
- Keep the shared `SKILL.md` and architecture references client-neutral.
- Add no dependency, script, external integration, product-specific term, absolute path, placeholder, or symlink.
- Keep Codex agent names unchanged and use lowercase hyphenated names for Claude agents.
- The Claude reviewer has only `Read`, `Grep`, and `Glob`; the Claude migrator has `Read`, `Grep`, `Glob`, `Write`, `Edit`, and `Bash`.
- Both Claude agents preload `react-vertical-slices` and inherit the parent model.
- Bump every package and catalog version from `0.2.0` to `0.3.0`.
- Do not install Claude Code when its CLI is unavailable; report that runtime validation could not run.
- Do not modify Relations or create a pull request.

---

### Task 1: Define the cross-client agent contract

**Files:**
- Modify: `packages/react-vertical-slices/tests/test_skill_contract.py`
- Modify: `packages/react-vertical-slices/tests/behavior-scenarios.md`
- Modify: `packages/react-vertical-slices/tests/behavior-results.md`

**Interfaces:**
- Consumes: existing Codex TOML files under `packages/react-vertical-slices/agents/`
- Produces: failing contract tests for the two Claude Markdown files and their behavioral equivalence

- [ ] **Step 1: Add a minimal Markdown-frontmatter parser and Claude agent paths**

Add standard-library-only test helpers:

```python
CLAUDE_AGENT_PATHS = (
    AGENT_ROOT / "react-vertical-slices-reviewer.md",
    AGENT_ROOT / "react-vertical-slices-migrator.md",
)


def parse_markdown_agent(path: Path) -> tuple[dict[str, object], str]:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---\n(.*)\Z", text, re.DOTALL)
    if match is None:
        raise AssertionError(f"Invalid agent frontmatter: {path}")

    metadata: dict[str, object] = {}
    active_list: list[str] | None = None
    for line in match.group(1).splitlines():
        if line.startswith("  - ") and active_list is not None:
            active_list.append(line[4:])
            continue

        key, value = line.split(":", 1)
        value = value.strip()
        if value:
            metadata[key] = value
            active_list = None
        else:
            active_list = []
            metadata[key] = active_list

    return metadata, match.group(2).strip()
```

- [ ] **Step 2: Add tests for required files and Claude-native contracts**

Require both Markdown files, hyphenated unique names, no `model` field, the
preloaded skill, exact reviewer tools, required migrator tools, approval gates,
and matching verdict/output sections:

```python
def test_claude_agents_use_native_names_tools_and_shared_skill(self):
    reviewer, reviewer_prompt = parse_markdown_agent(CLAUDE_AGENT_PATHS[0])
    migrator, migrator_prompt = parse_markdown_agent(CLAUDE_AGENT_PATHS[1])

    self.assertEqual("react-vertical-slices-reviewer", reviewer["name"])
    self.assertEqual("react-vertical-slices-migrator", migrator["name"])
    self.assertNotIn("model", reviewer)
    self.assertNotIn("model", migrator)
    self.assertEqual(["react-vertical-slices"], reviewer["skills"])
    self.assertEqual(["react-vertical-slices"], migrator["skills"])
    self.assertEqual(["Read", "Grep", "Glob"], reviewer["tools"])
    self.assertEqual(
        ["Read", "Grep", "Glob", "Write", "Edit", "Bash"],
        migrator["tools"],
    )
    self.assertIn("approved architecture plan", migrator_prompt.lower())
    self.assertIn("changes_required", reviewer_prompt.lower())
```

Extend existing portability, integration, symlink, and forbidden-content scans
so Markdown agents are covered automatically.

- [ ] **Step 3: Add Claude-specific behavioral scenarios**

Add pending scenarios for plugin discovery/scoped invocation, reviewer read-only
tools, and migrator refusal without approval. Add matching honest `Pending` rows
to `behavior-results.md` because no Claude CLI is installed in this environment.

- [ ] **Step 4: Run the contract suite and verify RED**

Run:

```bash
cd packages/react-vertical-slices
python3 -B -m unittest discover -s tests -v
```

Expected: FAIL because `react-vertical-slices-reviewer.md` and
`react-vertical-slices-migrator.md` do not exist.

---

### Task 2: Add native Claude Code agents and usage documentation

**Files:**
- Create: `packages/react-vertical-slices/agents/react-vertical-slices-reviewer.md`
- Create: `packages/react-vertical-slices/agents/react-vertical-slices-migrator.md`
- Modify: `packages/react-vertical-slices/README.md`

**Interfaces:**
- Consumes: `skills/react-vertical-slices/SKILL.md` through Claude's `skills` frontmatter field
- Produces: plugin agents named `react-vertical-slices:react-vertical-slices-reviewer` and `react-vertical-slices:react-vertical-slices-migrator`

- [ ] **Step 1: Create the read-only reviewer**

```markdown
---
name: react-vertical-slices-reviewer
description: Review React vertical-slice plans and implementations when capability boundaries, public APIs, sharing, or cross-slice dependencies need validation.
tools:
  - Read
  - Grep
  - Glob
skills:
  - react-vertical-slices
---

Use the preloaded `react-vertical-slices` skill throughout the review. Stop and
state that the required skill is unavailable if it was not loaded.

Read applicable repository instructions, including `CLAUDE.md` and `AGENTS.md`
when present. Work in plan-review or implementation-review mode as requested.
Remain read-only and never approve your own exceptions.

Assess capability ownership, public boundaries, dependency direction, sharing,
and migration scope. Use exactly one verdict: `approved`, `changes_required`, or
`blocked`.

Return: Blocking violations, Non-blocking improvements, Existing debt, Required
corrections, and Remaining risks. Keep existing debt separate from corrections
and do not expand the requested scope.
```

- [ ] **Step 2: Create the approval-gated migrator**

```markdown
---
name: react-vertical-slices-migrator
description: Implement one approved React vertical-slice migration unit when boundaries, public APIs, constraints, and verification are already agreed.
tools:
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - Bash
skills:
  - react-vertical-slices
---

Use the preloaded `react-vertical-slices` skill throughout the migration. Stop
and state that the required skill is unavailable if it was not loaded.

Read applicable repository instructions, including `CLAUDE.md` and `AGENTS.md`
when present. Act only after an explicit implementation request and an approved
architecture plan. Require the target subtree, approved boundaries, expected
public API, behaviour constraints, and verification expectations before work.

Implement one agreed migration unit. Preserve behaviour, styling, and public
contracts. Stop on ambiguity, conflict, or unapproved expansion.

Return: Changed areas, Verification, and Remaining risks.
```

- [ ] **Step 3: Document Claude invocation and local copying**

Update the package README to distinguish Codex TOML templates from Claude
Markdown plugin agents. Include natural-language and scoped invocation:

```text
Use the react-vertical-slices:react-vertical-slices-reviewer agent to review this plan.
@agent-react-vertical-slices:react-vertical-slices-reviewer review this implementation
```

Document optional independent copies to `.claude/agents/` and keep the existing
Codex copy instructions.

- [ ] **Step 4: Run the contract suite and verify GREEN**

Run:

```bash
cd packages/react-vertical-slices
python3 -B -m unittest discover -s tests -v
```

Expected: PASS.

- [ ] **Step 5: Commit the agent capability**

```bash
git add packages/react-vertical-slices/agents packages/react-vertical-slices/README.md packages/react-vertical-slices/tests
git commit -m "feat: add Claude vertical slices agents"
```

---

### Task 3: Release and validate version 0.3.0

**Files:**
- Modify: `packages/react-vertical-slices/tests/test_skill_contract.py`
- Modify: `packages/react-vertical-slices/.codex-plugin/plugin.json`
- Modify: `packages/react-vertical-slices/.claude-plugin/plugin.json`
- Modify: `.agents/plugins/marketplace.json`
- Modify: `.claude-plugin/marketplace.json`
- Review: `README.md`
- Review: `packages/README.md`

**Interfaces:**
- Consumes: the completed cross-client package
- Produces: synchronized `0.3.0` package metadata and a pushed feature branch

- [ ] **Step 1: Change the version assertion to 0.3.0 and verify RED**

Change the manifest assertion:

```python
self.assertEqual("0.3.0", manifest["version"])
```

Run the contract suite. Expected: FAIL because manifests still declare `0.2.0`.

- [ ] **Step 2: Synchronize all package and catalog versions**

Change `react-vertical-slices` from `0.2.0` to `0.3.0` in both package manifests
and both repository catalogs. Do not change other packages.

- [ ] **Step 3: Review root package summaries**

Confirm `README.md` and `packages/README.md` still accurately describe a
cross-client architecture package. Change them only if they omit the newly
important agent capability.

- [ ] **Step 4: Run all available verification**

```bash
python3 -B -m unittest discover -s packages/react-vertical-slices/tests -v
python3 /Users/pol/.codex/skills/.system/skill-creator/scripts/quick_validate.py packages/react-vertical-slices/skills/react-vertical-slices
python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py packages/react-vertical-slices
node scripts/validate-marketplaces.mjs
git diff --check
```

Expected: all commands pass. Also run the following when `claude` is available:

```bash
claude plugin validate ./packages/react-vertical-slices --strict
claude --plugin-dir ./packages/react-vertical-slices --agent react-vertical-slices:react-vertical-slices-reviewer -p "Return the configured reviewer verdict values only."
```

The current environment has no Claude CLI, so do not install it and report these
two commands as unrun.

- [ ] **Step 5: Commit and push the release metadata**

```bash
git add .agents/plugins/marketplace.json .claude-plugin/marketplace.json packages/react-vertical-slices README.md packages/README.md
git commit -m "chore: release React vertical slices 0.3.0"
git push -u origin codex/react-vertical-slices-claude-agents
```
