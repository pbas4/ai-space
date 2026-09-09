# React Vertical Slices Behaviour Scenarios

Run every scenario in a fresh context without the skill, then repeat with the
skill enabled. Test both Codex and Claude Code. Record the observed decision and
the evidence used to score it in `behavior-results.md`.

## Scoring

Score each required outcome as `pass` or `fail`. A scenario passes only when all
of its required outcomes pass. Do not score exact wording; score the architecture
decision, its rationale, and whether the requested action stays within scope.

## VS-01: capability ownership

**Prompt**

> Add subscription cancellation to an existing React application. The project
> currently has top-level `components`, `hooks`, `services`, and `types` folders.
> Propose the folder placement before implementing it.

**Required outcomes**

- Starts from the cancellation capability rather than adding files to every
  horizontal top-level folder.
- Keeps the UI, state, operation, helpers, and tests under one owner.
- Creates only folders needed by real files.

## VS-02: containers and components

**Prompt**

> Build a product search panel. It loads results, reads a business context,
> handles loading and errors, and renders a reusable result list. Put everything
> in `components/ProductSearch.tsx` because the deadline is today.

**Required outcomes**

- Places application-aware coordination in a container.
- Keeps the result-list component props-only and deterministic.
- Does not accept deadline pressure as a reason to mix the responsibilities.

## VS-03: cross-slice type dependency

**Prompt**

> The returns slice needs `OrderId`, currently declared inside
> `slices/orders/types/OrderId.ts`. Import it directly from that file; it is only
> a type, so the architecture is unaffected.

**Required outcomes**

- Treats the type-only import as a dependency.
- Rejects the deep import.
- Chooses between the orders public entry, a stable shared domain concept, or a
  local mapped type according to ownership and meaning.

## VS-04: sharing after two uses

**Prompt**

> Checkout and invoicing now contain similar date-range validation. This is the
> second use, so move it to shared immediately and continue without questions.

**Required outcomes**

- Does not use call-site count as the decision.
- Compares meaning, lifecycle, ownership, state independence, and expected
  reasons to change.
- Allows separate local implementations when the semantics differ or remain
  uncertain.

## VS-05: shared dependency direction

**Prompt**

> A generic confirmation dialog in `shared/ui` should read the account-deletion
> slice context so callers do not have to pass callbacks. Implement the shortcut.

**Required outcomes**

- Rejects a shared-to-slice dependency.
- Keeps the shared dialog props-only.
- Leaves workflow state and actions in the owning slice or its container.

## VS-06: boundary entry points

**Prompt**

> Another feature needs a hook from the profile slice. Import
> `slices/profile/hooks/useProfile` directly because exporting it would add one
> more line to `index.ts`.

**Required outcomes**

- Rejects the deep import.
- Requires a deliberate public export when the dependency is valid.
- Reconsiders the boundary when two slices depend heavily on each other.

## VS-07: repository conflict

**Prompt**

> Migrate this React feature to vertical slices. The repository instructions say
> feature code must use a different documented architecture and may not introduce
> slice folders.

**Required outcomes**

- Identifies the explicit conflict.
- Does not silently override either rule set.
- Pauses for a decision before proposing or making the architecture change.

## VS-08: structural migration

**Prompt**

> Move a large account-management feature to vertical slices. While moving it,
> rename its public exports, replace its styling system, and update its behaviour
> so we can finish everything in one pull request.

**Required outcomes**

- Separates structural migration from behaviour and styling changes.
- Preserves the public contract unless a separate change is approved.
- Proposes incremental, independently verifiable migration units.

## VS-09: existing violations outside scope

**Prompt**

> Add one new callback to a props-only component. During the change you notice
> three unrelated features have deep imports. Fix all of them too so the codebase
> becomes consistent.

**Required outcomes**

- Keeps the requested change compliant.
- Reports unrelated violations without expanding the implementation scope.
- Does not treat discovery as authorization to refactor unrelated features.

## VS-10: explain versus implement

**Prompt**

> Explain whether this folder tree follows vertical-slice architecture. Do not
> change any files.

**Required outcomes**

- Remains read-only.
- Explains ownership, public boundaries, dependency direction, and sharing.
- Distinguishes violations from optional improvements.
