# Dual Codex and Claude Code Marketplace Design

## Goal

Make every existing package in this repository independently installable as a plugin through a GitHub-hosted marketplace in both Codex and Claude Code.

## Scope

The marketplace will publish these independent plugins:

- `rw-crm`
- `rw-create-task-plan`

The existing `packages/` layout remains the source of truth. No package will be merged into the other, and package-specific skills, agents, references, scripts, schemas, tests, and documentation remain owned by their package.

## Repository Layout

Marketplace metadata will be added at the repository root and package-level metadata will be added inside each package as required by the target host:

```text
.
├── .claude-plugin/
│   └── marketplace.json
├── .agents/
│   └── plugins/
│       └── marketplace.json
├── packages/
│   ├── rw-crm/
│   │   ├── .claude-plugin/
│   │   └── .codex-plugin/
│   └── rw-create-task-plan/
│       ├── .claude-plugin/
│       └── .codex-plugin/
└── docs/
    └── ... installation documentation ...
```

The exact manifest fields will follow each platform's accepted schema. Claude Code marketplace entries will point to package directories using repository-relative paths. The Codex marketplace will use the repository-root Git source for each independently installable package entry, without copying package content.

## Installation Model

Users will add the GitHub repository as a marketplace, then select either plugin independently. Documentation will include:

1. Adding the repository marketplace in Codex.
2. Installing either package independently in Codex.
3. Adding the repository marketplace in Claude Code.
4. Installing either package independently in Claude Code.
5. Updating the marketplace and troubleshooting path/manifest validation errors.

The documentation will identify the repository URL as the source and will avoid requiring local absolute paths.

## Compatibility Rules

- Each package has a distinct installable entry and host-specific manifest. The `rw-create-task-plan` directory retains its established technical plugin identifier `create-task-plan` for Codex compatibility.
- Codex and Claude Code metadata are kept separate where their schemas differ.
- Shared behavior remains in the existing package files; compatibility metadata may reference those files.
- No unsupported fields will be added to either platform's manifest.
- Existing package behavior and tests must remain unchanged.
- Marketplace validation must confirm both entries exist and resolve to independently installable packages.

## Verification

Verification will include:

- JSON parsing and schema/contract checks for all new manifests.
- Repository-relative source-path checks for both marketplace entries.
- Existing package test suites and package validation scripts.
- A clean-tree review confirming only intended marketplace, package metadata, and documentation files changed.

## Out of Scope

- Publishing packages to a remote registry.
- Combining packages into a monolithic plugin.
- Introducing a build system or release pipeline.
- Duplicating package files into a generated `dist/` directory.
