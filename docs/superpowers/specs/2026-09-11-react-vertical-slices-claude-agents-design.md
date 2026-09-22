# React Vertical Slices Claude Agents

## Goal

Make the existing reviewer and migrator available as native Claude Code plugin
agents without changing the shared architecture guidance or the Codex agents.

## Package shape

The existing `packages/react-vertical-slices/agents/` directory will contain
both client formats:

```text
agents/
├── react_vertical_slices_reviewer.toml
├── react_vertical_slices_migrator.toml
├── react-vertical-slices-reviewer.md
└── react-vertical-slices-migrator.md
```

Codex continues to read the TOML templates. Claude Code discovers the Markdown
files as plugin agents. The wrappers intentionally duplicate only the small
client-specific behavior contract; the architecture rules remain in the shared
`react-vertical-slices` skill.

## Claude agent contracts

Both Claude agents use lowercase, hyphenated names and preload the existing
`react-vertical-slices` skill. They omit a model so Claude inherits the model
from the parent session.

The reviewer exposes only `Read`, `Grep`, and `Glob`. It supports plan and
implementation review, remains read-only, and returns one of `approved`,
`changes_required`, or `blocked` with the same result sections as the Codex
reviewer.

The migrator exposes the normal read, search, edit, and shell tools needed for
an implementation. Its instructions require an explicit implementation request,
an approved architecture plan, the target subtree, approved boundaries, expected
public API, behaviour constraints, and verification expectations. It implements
one migration unit at a time and preserves behaviour, styling, and public
contracts by default.

## Packaging and documentation

Adding Claude agents is a backward-compatible package capability, so the package
version moves from `0.2.0` to `0.3.0`. The Codex and Claude manifests and both
repository catalogs remain synchronized.

The package README will explain native invocation in both clients, including
Claude natural-language invocation, scoped agent mentions, and local copying to
`.claude/agents/`. The root and packages READMEs will be reviewed and changed
only if their package summaries are no longer accurate.

## Tests and verification

Contract tests will be written before the Claude wrappers. They will require:

- both Markdown agent files and valid YAML frontmatter;
- unique hyphenated Claude names and inherited model selection;
- the shared skill preloaded by both agents;
- a read-only reviewer tool set;
- migrator editing tools and approval gates;
- matching behavioral and output contracts across the Claude and Codex formats;
- no product names, absolute paths, external integrations, placeholders, or
  symlinks.

Verification will include the package contract suite, skill and plugin validators,
both catalog validators, `claude plugin validate --strict`, a fresh Claude plugin
discovery check, and `git diff --check`.

## Scope

This change affects only the `ai-space` package. It does not copy Claude agents
into Relations, change the shared architecture rules, install anything globally,
or create a pull request. The branch is stacked on
`codex/react-vertical-slices-agents` and will be pushed as
`codex/react-vertical-slices-claude-agents`.
