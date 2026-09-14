# Architecture Guide

## The idea

A vertical codebase groups code around a user capability instead of a technical
category. A change to checkout, profile editing, or report export should usually
stay inside the boundary that owns that outcome.

```text
slices/
├── manage-subscription/
├── update-profile/
└── export-report/
```

Each slice can contain its UI, state, services, validation, helpers, styles, and
tests. Technical folders still exist, but only after capability ownership has
been established.

A slice is first an ownership boundary. It is not automatically a deployable
package, separate application, or library.

## Choose boundaries by reasons to change

Start with these questions:

1. Which user outcome does this code support?
2. Which files usually change together for that outcome?
3. Can the capability be explained through a small public contract?
4. Can its implementation change without breaking unrelated features?

A useful slice is large enough to represent a real capability and small enough
to understand and test independently. Too many tiny slices create navigation and
coordination overhead. One large slice that owns every workflow hides the same
coupling under a new folder name.

## Coordinate at the top

A feature container may connect slices through explicit results, callbacks, or
commands. It should not absorb their internal behaviour.

```text
Feature container
       │
       ├──► slice A public entry
       ├──► slice B public entry
       └──► shared public entries
```

For example, completing an edit workflow may trigger a refresh command exposed
by a browsing workflow. Neither slice needs to read the other’s private state.

Direct slice-to-slice dependencies are allowed only through public entries and
should remain uncommon. Heavy two-way use usually means the boundary is wrong,
the slices are too small, or the coordination belongs at the feature level.

## Make shared code earn its place

`shared/` is not a waiting room for code without an owner. Code belongs there
when several capabilities use it with the same meaning, it should change with
all of them, and it stays independent of their workflow state.

Two uses are enough to ask about sharing, not enough to answer. Evaluate:

- Do both consumers mean the same thing?
- Should they change together?
- Does one slice naturally own the capability?
- Is the code independent of slice state?
- Does extraction reduce coupling, or only remove duplicate lines?

The result may be shared code, two local implementations, or one owning slice
that exposes a command or result. Small duplication is often cheaper than a
premature abstraction.

## Containers and components

A container is application-aware. It reads state, starts operations, maps data,
chooses loading and error states, builds callbacks, and renders props-only UI.

A component receives prepared props and reports user intent through callbacks.
Its output is determined by its props. It does not fetch, call services, read
business context, or decide how a workflow operates.

This distinction is about responsibility, not React purity. Containers must also
render purely. Business rules belong in services, hooks, or pure domain
functions rather than inside JSX.

Each component or container is also a small ownership unit. Its implementation,
test, and private supporting files live in one folder behind a local entry. This
makes ownership and imports predictable without turning the component into a
feature-level public API.

## Benefits

- Product changes touch fewer unrelated areas.
- Paths reveal the owner of behaviour.
- Public entries make coupling visible.
- Tests and fixtures move with the behaviour they protect.
- Features become easier to replace or remove.
- Reviewers can reason about a smaller part of the codebase.
- Component tests and private helpers are easy to find beside the code they
  protect.

Clear ownership also helps coding agents load less irrelevant context, choose
focused verification, avoid edits to broad shared modules, and produce plans with
explicit contracts.

## Trade-offs

- Finding capability boundaries takes judgment.
- Some duplication remains while abstractions are uncertain.
- Cross-slice workflows need explicit coordination.
- Structural migrations create temporary import churn.
- Leaf folders add some navigation and small entry files.
- Shared folders can still become junk drawers when reuse count replaces meaning.

The benefits come from real boundaries and dependency direction. Renaming
folders while retaining deep imports and broad barrels does not improve the
architecture.

## Sources

- [The Vertical Codebase](https://tkdodo.eu/blog/the-vertical-codebase)
- [Moving to a Feature-Based React Architecture](https://adjoe.io/company/engineer-blog/moving-to-feature-based-react-architecture/)
- [Code Quality](https://frontend-fundamentals.com/code-quality/en/)
- [Maintainability With Colocation](https://webflow-new.povio.com/blog/maintainability-with-colocation)
- [Components and Hooks Must Be Pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure)
