# Folder and Dependency Conventions

## Basic shape

Each feature and slice has one file at its root: normally `index.ts`. Everything
else lives in a named folder.

```text
Feature/
├── index.ts
├── containers/
│   └── FeatureName/
│       ├── FeatureName.tsx
│       ├── FeatureName.spec.tsx
│       └── index.ts
├── components/
│   └── ComponentName/
│       ├── ComponentName.tsx
│       ├── ComponentName.spec.tsx
│       └── index.ts
├── hooks/
├── services/
├── utils/
├── types/
├── slices/
│   └── capability/
│       ├── index.ts
│       ├── containers/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── utils/
│       └── types/
└── shared/
    ├── domain/
    │   ├── index.ts
    │   ├── models/
    │   └── rules/
    ├── infrastructure/
    │   ├── index.ts
    │   ├── api/
    │   ├── browser/
    │   └── storage/
    └── ui/
        ├── index.ts
        └── components/
            └── SharedComponent/
                ├── SharedComponent.tsx
                ├── SharedComponent.spec.tsx
                └── index.ts
```

This is a menu, not a scaffold. Create a folder only when it owns a real file.
Nested slices are useful when a capability is private to a larger workflow.

## Public entries

An `index.ts` defines the boundary’s public contract. Export only the component,
command, result, or type that a consumer genuinely needs.

```ts
export { Checkout } from './containers/Checkout';
export type { CheckoutResult } from './types/CheckoutResult';
```

Consumers import from the entry:

```ts
import { Checkout } from '../slices/checkout';
```

They do not reach into internals:

```ts
// Boundary violation
import { Checkout } from '../slices/checkout/containers/Checkout';
```

Avoid wildcard exports. A public entry is an intentional contract, not an index
of every file.

## React folders

Every component and container is a leaf ownership unit with its own folder,
colocated test, and local `index.ts`. The same rule applies under `components/`,
`containers/`, and `shared/ui/components/`.

```text
components/
└── ComponentName/
    ├── ComponentName.tsx
    ├── ComponentName.spec.tsx
    ├── ComponentName.types.ts      # optional
    ├── ComponentName.module.scss   # optional
    ├── ComponentName.stories.tsx   # optional
    ├── hooks/                      # optional, private to this component
    ├── components/                 # optional private children
    │   └── ChildName/
    │       ├── ChildName.tsx
    │       ├── ChildName.spec.tsx
    │       └── index.ts
    └── index.ts
```

Optional files are never scaffolded empty. Use the target repository's test
suffix and file extensions; `.spec.tsx` is only the TypeScript example.

The leaf `index.ts` exports the component and only the types its consumers need,
using the repository's established export style. Wildcard exports remain
discouraged.

```ts
export { ComponentName } from './ComponentName';
export type { ComponentNameProps } from './ComponentName.types';
```

Code outside the folder imports its entry:

```ts
import { ComponentName } from './components/ComponentName';

// Boundary violation: implementation-file deep imports are not allowed
import { ComponentName } from './components/ComponentName/ComponentName';
```

This local entry does not make the component a feature or slice public API.
External consumers still import through the feature or slice root. That root
decides whether the component is public at all.

A private child used by one parent stays under
`ParentName/components/ChildName/`. If multiple owners use it, move it to their
nearest common `components/` folder. Reuse does not automatically make it
feature-wide or shared UI.

### `containers/`

Containers connect the feature or slice to application behaviour. They may:

- Read state through hooks or contexts.
- Start queries, mutations, or services.
- Coordinate loading, empty, success, and error states.
- Map domain data into component props.
- Create callbacks and compose props-only components.

Keep detailed reusable markup and business rules elsewhere. Use a natural name
such as `ProductSearch` for the connected component.

Providers and other React components follow the same folder rule after their
responsibility is clear. Application-aware providers belong in `containers/`;
props-only providers belong in `components/`.

### `components/`

Components are props-only and presentation-focused. They may render prepared
data, compose other props-only components, call callbacks received through props,
and use shared UI.

They do not fetch data, call services, read business contexts, depend on
transport response shapes, make workflow decisions, or import containers.

Use `View` for a main presentational counterpart when it improves clarity, such
as `ProductSearchView`. Smaller components keep natural names such as
`ProductCard` or `EmptyState`.

Test components as input/output contracts. Test containers as integration points
for data mapping, status selection, callbacks, and service interaction.

## Supporting folders

- **`hooks/`** owns React state and orchestration used across the slice. A hook
  used by one component may stay beside it.
- **`services/`** implements use cases: request mapping, workflow rules,
  infrastructure coordination, and result mapping.
- **`utils/`** contains small pure helpers owned by the boundary. It is not a
  holding area for unclear ownership.
- **`types/`** contains local state shapes, form values, shared component props,
  and service inputs or results. Types remain private unless the public entry
  exports them.
- Component- or container-owned types, styles, stories, fixtures, hooks, helpers,
  and tests stay in its leaf folder. Use a slice-level `testing/` folder only for
  fixtures or builders shared by several tests in that slice.

## Shared areas

Nothing lives directly under `shared/`, and there is no `shared/index.ts`.

- **`shared/domain/`** contains stable business language and pure rules: value
  objects, identifiers, domain values, calculations, and validation with the same
  meaning across workflows. It does not depend on React, browser APIs,
  infrastructure, or slice state.
- **`shared/infrastructure/`** provides stable communication mechanisms such as
  configured clients, authentication helpers, browser storage, navigation, and
  messaging adapters. It owns how communication happens, not why a workflow
  invokes it.
- **`shared/ui/`** contains stable props-only presentation used by unrelated
  workflows. It may use shared domain types but cannot read slice state or start
  operations.

Import from the three specific entries so the dependency remains visible.

## Dependency direction

| Importing area | May import | Must not import |
| --- | --- | --- |
| Feature container | Slice public entries, shared entries, private wiring | Slice internals |
| Slice container | Its own internals and shared entries | Another slice’s internals |
| Slice component | Props-only components, shared UI, shared domain types | Containers, services, infrastructure, business contexts |
| Shared UI | Shared domain, presentation dependencies | Slices, containers, infrastructure operations |
| Shared infrastructure | Shared domain, clients, configuration | Slices and feature UI |
| Shared domain | Pure domain modules | React, browser APIs, infrastructure, slices |

Shared code never imports a slice. Circular dependencies require a boundary
review before implementation continues.

## Types across slices

Type-only imports count as dependencies. Choose one of three cases:

1. **One slice owns the type.** Export it from that slice’s public entry.
2. **The type is a stable shared business concept.** Move it to
   `shared/domain` when every consumer gives it the same meaning.
3. **The shapes only look similar.** Keep local types and map between them at the
   feature boundary.

Never deep-import another slice’s `types/` folder. A circular type dependency
usually belongs in shared domain, at the feature boundary, or signals slices that
are too fragmented.

## Review checklist

- Does the path reveal the owning capability?
- Is the entry point the only file at the boundary root?
- Are connected components in `containers/` and props-only UI in `components/`?
- Does every component and container have its own folder, colocated test, and
  local entry?
- Are private children nested with their sole owner and multi-owner components
  placed at the nearest common component folder?
- Do imports outside a component folder use its local entry rather than its
  implementation file?
- Do consumers use public entries?
- Does shared code remain independent of slices?
- Is shared meaning proven rather than inferred from call-site count?
- Do tests and styles stay with their owner?
- Is the dependency graph acyclic?
