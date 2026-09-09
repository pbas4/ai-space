# Migration Guide

Use this guide for an existing React feature. A migration changes ownership and
paths; it does not automatically authorize changes to behaviour, public APIs,
styling, dependencies, or tooling.

## Before moving files

1. Record the stable external entry points and observable behaviour.
2. Inspect repository instructions, build configuration, path aliases, tests,
   styles, generated files, and consumers.
3. Map capabilities by user outcome and normal reason to change.
4. Trace state ownership and dependencies, especially broad shared modules,
   contexts, deep imports, and circular relationships.
5. Choose an isolated but representative pilot capability.

Stop and surface any conflict between repository rules and this architecture.
Do not treat a migration request as permission to override local instructions.

## Move one ownership boundary at a time

For each capability:

1. Add its narrow public entry.
2. Move its connected React layer into `containers/`.
3. Move deterministic props-only UI into `components/`.
4. Move its hooks, services, utilities, types, styles, tests, and fixtures with
   their owner.
5. Replace external deep imports with the public entry.
6. Use temporary compatibility exports only when consumers cannot move in the
   same review unit. Record exactly when each export will be removed.
7. Run focused verification before starting the next capability.

A review unit is one coherent ownership change, not a fixed line count. It should
be understandable, testable, and revertible on its own.

## Coordinate without coupling slices

When one workflow affects another, connect their public results and commands at
the feature container. Do not move both workflows into one shared context merely
to avoid an explicit callback or command.

Split existing broad state containers as their owners move. Relocating a broad
context unchanged preserves the original coupling.

## Shrink shared code last

After capability ownership is visible:

- Move single-slice code to its owner.
- Keep stable business concepts in `shared/domain`.
- Keep communication mechanisms in `shared/infrastructure`.
- Keep reusable props-only presentation in `shared/ui`.
- Remove broad barrels, obsolete aliases, and expired compatibility exports.

Do not extract code merely because it appears twice. Re-evaluate meaning,
lifecycle, ownership, and state independence for every candidate.

## Acceptance criteria for each step

- External behaviour and public contracts remain unchanged unless separately
  approved.
- Existing styling and dependencies remain unchanged unless separately scoped.
- The boundary root contains only its public entry.
- Containers and components follow their distinct responsibilities.
- Consumers import through public entries.
- Shared code has no dependency on feature or slice state.
- Tests and styles move with their owner.
- Focused tests, type checks, and static checks pass.
- Temporary compatibility code has an explicit removal step.
- Unrelated architecture debt is reported rather than silently added to scope.

Add automated boundary rules only after the team has validated the structure in
real feature work. Automation should encode stable decisions rather than decide
the architecture for the team.
