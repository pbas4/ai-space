# Focused adapter boundary

Adapters provide evidence to `runEngineerWorkflow`; they do not own component decisions.

```js
contextAdapter.discover(request) -> Promise<ContextReport>
createConfluenceContextAdapter({ rootId, listChildren, fetchPage }).discover(request)
implementationAdapter.propose(context, request) -> Promise<Plan>
implementationAdapter.apply(plan, approvedEdits) -> Promise<string[]>
verifier.run(scope, changedArtifacts) -> Promise<VerificationReport>
```

Implementations may connect Figma, UI-library, CRM-code, testing, visual, or accessibility helpers. The package remains independently usable with deterministic adapters and does not modify the Create Task Plan plugin.

`createCodexHostAdapter(host)` accepts a host with `discoverContext`, `refreshContext`, `proposeImplementation`, `applyImplementation`, and `verify` functions. It exposes these at the workflow's `discover`, `refresh`, `implementationAdapter`, and `verifier` boundaries.

Hosts may additionally expose `inspectFigma`, `inspectVisual`, and `checkAccessibility`. These optional evidence helpers are read-only and return `{ findings, gaps }`; generic hosts are not required to provide them.

Every source returned from host discovery must first be authorized by `createSourcePolicy(...).authorizeSource(source)` before it is used to construct a context snapshot. Figma and Confluence sources require approved HTTPS hosts; repository sources require an approved normalized Git remote.

The Confluence adapter defaults to root page `21790813`. `listChildren(pageId)` supplies read-only descendant metadata; every reachable descendant is indexed for the task. `fetchPage(source)` retrieves bodies only after source selection. Inaccessible descendants, child-listing failures, and failed body retrievals are returned as structured gaps.
