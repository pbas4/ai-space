---
name: react-vertical-slices
description: Use when designing, migrating, implementing, or reviewing React feature architecture involving vertical slices, feature boundaries, shared code, container components, presentational components, or cross-slice dependencies.
---

# React Vertical Slices

Organize React code around capabilities that users recognize. Keep code that
changes together under one owner, expose narrow public entries, and make
dependency direction visible.

## Invocation scope

Use this skill when the user explicitly asks for `$react-vertical-slices`, or
when the applicable `AGENTS.md` explicitly adopts this convention for the
target area. Do not infer its use from unrelated React work, even if the request
mentions features, folders, components, or imports. An adopted-area instruction
is a deliberate authorization to use the skill; it does not make unrelated
areas adopted.

## Start with the request

1. Identify whether the user wants an explanation, plan, implementation, or
   review. Explanation and review are read-only unless edits are explicitly
   requested. Implementation requires an explicit request and any approval
   required by the target repository.
2. Read the target repository’s instructions and inspect its current structure,
   entry points, tests, and established patterns.
3. If an explicit repository rule conflicts with this skill, show the exact
   conflict and pause for a decision. Never override or ignore it silently.

## Read only the guidance needed

- Read [architecture](references/architecture.md) when explaining the pattern,
  choosing slice boundaries, or deciding whether code is genuinely shared.
- Read [folder conventions](references/folder-conventions.md) before proposing,
  changing, or reviewing folder placement, imports, components, or types.
- Read [migration](references/migration.md) before reorganizing an existing
  feature. Do not load it for a new isolated slice.

## Required boundaries

- Name feature and slice boundaries after capabilities, not technical layers.
- Keep one public entry file at a feature or slice root, normally `index.ts`.
  Put every other file in a purposeful folder and never create empty scaffolds.
- Treat slice internals as private. Consumers import from public entries.
- Put application-aware React components in `containers/`. They connect state,
  hooks, services, contexts, loading, errors, and callbacks to the UI.
- Put deterministic props-only UI in `components/`. It must not fetch data, call
  services, read business context, depend on transport shapes, or import a
  container.
- Give every component and container its own folder, a colocated test, and a
  local `index.ts`. Import it from outside that folder through the local entry;
  do not deep-import its implementation file.
- Allow only `shared/domain`, `shared/infrastructure`, and `shared/ui`. Nothing
  lives directly under `shared/`, and there is no broad `shared/index.ts`.
- Shared code never imports a feature or slice. Type-only imports still count as
  dependencies. Never deep-import another slice’s types.
- A second use triggers a sharing decision; it does not settle it. Compare
  meaning, ownership, lifecycle, state independence, and reasons to change.
- Keep tests, styles, fixtures, state, services, and helpers with their owner.

In review mode, report flat component or container files, missing colocated
tests, missing leaf entries, and imports that bypass a leaf entry as violations
in changed code. Keep untouched legacy cases separate as existing debt.

## Work within scope

For new or changed code, do not knowingly introduce a boundary violation. When
an existing violation is outside the requested work, report it without expanding
the implementation scope. Structural migrations preserve behaviour, styling,
and public contracts unless the user separately approves changing them.

Finish with the narrowest relevant tests, type checks, and static checks provided
by the target repository. Report what was verified and any remaining boundary or
tooling limitation.
