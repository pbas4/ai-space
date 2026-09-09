# React Vertical Slices

A shared skill for designing, migrating, implementing, and reviewing React code
with capability-based ownership and explicit dependency boundaries.

Codex and Claude Code use the same `SKILL.md` and local references. The package
contains separate manifests only because the clients package plugins
differently.

## Use it

- Codex: invoke `$react-vertical-slices` or describe matching React architecture
  work and allow automatic selection.
- Claude Code plugin: invoke
  `/react-vertical-slices:react-vertical-slices`.
- Claude Code personal skill: invoke `/react-vertical-slices`.

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
