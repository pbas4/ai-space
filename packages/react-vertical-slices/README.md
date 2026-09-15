# React Vertical Slices

A shared skill and seven specialist agents for designing, planning,
implementing, migrating, auditing, and reviewing React code with
capability-based ownership and explicit dependency boundaries.

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

## Agent suite

The package contains equivalent Codex TOML and Claude Markdown definitions for
seven independently callable specialists. They are not automatically installed;
copy them only into projects that choose to adopt them.

| Codex agent | Role | Access |
| --- | --- | --- |
| `react_vertical_slices_boundary_advisor` | Helps decide which slice should own a capability, asking one plain-language question at a time. | Read-only |
| `react_vertical_slices_planner` | Inspects the repository and writes a reviewable implementation plan. | Plan-file writes only |
| `react_vertical_slices_reviewer` | Reviews a plan or implementation and returns one verdict. | Read-only |
| `react_vertical_slices_implementer` | Adds approved new behaviour to a new or existing slice. | Workspace-write |
| `react_vertical_slices_migrator` | Applies approved structural moves while preserving behaviour and public contracts. | Workspace-write |
| `react_vertical_slices_dependency_auditor` | Audits a selected subtree for dependency direction and architecture debt. | Read-only |
| `react_vertical_slices_orchestrator` | Selects and coordinates the smallest appropriate workflow. | Delegation only |

The Implementer and Migrator deliberately have different jobs. Use the
Implementer for approved new behaviour. Use the Migrator for approved structural
work that should not change behaviour. Both are explicit and approval-gated.

The Advisor, Planner, Reviewer, and Auditor may be selected automatically only
when an applicable `AGENTS.md` adopts the convention for that subtree. The
Orchestrator, Implementer, and Migrator always require explicit invocation. This
keeps automatic delegation out of unrelated React work.

## Plans and approval

The Planner uses the repository's plan convention when one exists. Otherwise it
writes to `docs/plans/vertical-slices/YYYY-MM-DD-<feature-slug>-plan.md`. The plan
covers the request, boundaries, public contract, responsibilities, dependencies,
file placement, ordered units, preservation rules, verification, risks, and
handoff agent.

A written or reviewed plan is not implementation approval. The Orchestrator
stops after plan review and waits for explicit human authorization. Once
authorized, it runs write agents sequentially, reviews each unit, and permits at
most one in-scope correction before stopping for a decision.

## Use agents in Codex

Copy the TOML definitions into a project that has chosen to use them:

```bash
mkdir -p .codex/agents
cp packages/react-vertical-slices/agents/react_vertical_slices_*.toml \
  .codex/agents/
```

Call any specialist directly:

```text
Use the react_vertical_slices_boundary_advisor agent to help decide where this feature belongs.
Use the react_vertical_slices_planner agent to write the implementation plan.
Use the react_vertical_slices_dependency_auditor agent to audit src/features/orders.
```

Or explicitly ask for coordinated work:

```text
Use the react_vertical_slices_orchestrator agent to plan this capability and stop before implementation approval.
```

Copied project agents are independent of this package. Review and update them
deliberately.

## Use agents in Claude Code

Claude Code discovers the Markdown definitions when the plugin is installed or
loaded with `--plugin-dir`. Natural language can select an agent, while
`@agent-...` guarantees the choice:

```text
Use the react-vertical-slices:react-vertical-slices-planner agent to plan this feature.
@agent-react-vertical-slices:react-vertical-slices-dependency-auditor audit src/features/orders
@agent-react-vertical-slices:react-vertical-slices-orchestrator coordinate this migration
```

Each agent preloads the shared skill. Read-only agents expose only inspection
tools, the Planner can write only its plan by contract, write agents can edit and
verify approved work, and the Orchestrator delegates without implementing.

To use independent project copies without the plugin:

```bash
mkdir -p .claude/agents
cp packages/react-vertical-slices/agents/react-vertical-slices-*.md \
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
