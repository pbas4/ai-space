# React Vertical Slices

A shared skill for designing, migrating, implementing, and reviewing React code
with capability-based ownership and explicit dependency boundaries.

Codex and Claude Code use the same `SKILL.md` and local references. The package
contains separate manifests only because the clients package plugins
differently.

## Component ownership convention

Every component and container lives in its own folder with a colocated test and
local `index.ts`. Component-only types, styles, stories, fixtures, hooks, and
helpers stay there too. A child used by one parent stays beneath that parent;
multi-owner components move only to the nearest common `components/` folder.

New, moved, or materially changed components follow this convention. Untouched
legacy files remain reported debt rather than expanding a migration by default.

## Use it

- Codex: invoke `$react-vertical-slices` explicitly, or use it when the
  applicable `AGENTS.md` explicitly adopts the convention for the target area.
  It is not inferred from unrelated React work. `allow_implicit_invocation`
  remains disabled; an adopted-area instruction deliberately directs its use.
- Claude Code plugin: invoke
  `/react-vertical-slices:react-vertical-slices`.
- Claude Code personal skill: invoke `/react-vertical-slices`.

## Install from the AI Space marketplace

Add the marketplace once, then install the plugin:

```text
/plugin marketplace add pbas4/ai-space
/plugin install react-vertical-slices@ai-space
```

If the marketplace was already added before this plugin was published, refresh
it first:

```text
/plugin marketplace update ai-space
/plugin install react-vertical-slices@ai-space
```

## Local development

Load the complete package in Claude Code for one session:

```bash
claude --plugin-dir "$PWD/packages/react-vertical-slices"
```

Install the shared skill personally through symlinks:

The destinations are `~/.agents/skills/react-vertical-slices` for Codex and
`~/.claude/skills/react-vertical-slices` for Claude Code.

```bash
mkdir -p "$HOME/.agents/skills" "$HOME/.claude/skills"
ln -s "$PWD/packages/react-vertical-slices/skills/react-vertical-slices" \
  "$HOME/.agents/skills/react-vertical-slices"
ln -s "$PWD/packages/react-vertical-slices/skills/react-vertical-slices" \
  "$HOME/.claude/skills/react-vertical-slices"
```

If a client was already running when its top-level skills directory was created,
start a new session before checking discovery.

## Move it into a project later

Use `.agents/skills/react-vertical-slices` as the canonical project copy. When
the project permits relative symlinks, expose that same copy to Claude Code:

```bash
mkdir -p .claude/skills
ln -s ../../.agents/skills/react-vertical-slices \
  .claude/skills/react-vertical-slices
```

This keeps one source of truth. If the repository does not permit symlinks, copy
the same skill directory to both locations and update them together.

## Codex custom-agent templates

The `agents/` directory contains Codex TOML templates and native Claude Markdown
plugin agents. The Codex templates are not automatically installed. Copy them
into a project only when that project chooses to adopt them:

```bash
mkdir -p .codex/agents
cp packages/react-vertical-slices/agents/react_vertical_slices_reviewer.toml \
  .codex/agents/
cp packages/react-vertical-slices/agents/react_vertical_slices_migrator.toml \
  .codex/agents/
```

A copied project version is independent of this package; review and update it
deliberately. An applicable nested `AGENTS.md` may explicitly adopt the
convention for its subtree and request automatic delegation to
`react_vertical_slices_reviewer`; this does not extend to unrelated React work.
`react_vertical_slices_migrator` remains explicit and approval-gated.

## Claude plugin agents

Claude Code discovers both Markdown agents when the plugin is installed or
loaded with `--plugin-dir`. It may delegate automatically based on their
descriptions, or you can select the reviewer explicitly:

```text
Use the react-vertical-slices:react-vertical-slices-reviewer agent to review this plan.
@agent-react-vertical-slices:react-vertical-slices-reviewer review this implementation
```

The agents preload the shared `react-vertical-slices` skill, so its architecture
guidance is available without a separate skill invocation. The reviewer exposes
only read and search tools. The migrator can edit and run shell commands, but it
requires an explicit implementation request and an approved architecture plan.

To use independent project copies without the plugin, copy the Markdown files
to `.claude/agents/`:

```bash
mkdir -p .claude/agents
cp packages/react-vertical-slices/agents/react-vertical-slices-reviewer.md \
  .claude/agents/
cp packages/react-vertical-slices/agents/react-vertical-slices-migrator.md \
  .claude/agents/
```

Copied agents are independent of this package and should be reviewed and
updated deliberately.

## Validate

From this package directory:

```bash
python3 -m unittest discover -s tests -v
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" \
  skills/react-vertical-slices
python3 "$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" .
claude plugin validate . --strict
```

The behaviour scenarios in `tests/behavior-scenarios.md` test architecture
decisions rather than exact generated wording.
