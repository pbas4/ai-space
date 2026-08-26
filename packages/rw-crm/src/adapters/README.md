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

The Confluence adapter defaults to root page `21790813`. `listChildren(pageId)` supplies read-only descendant metadata; every reachable descendant is indexed for the task. `fetchPage(source)` retrieves bodies only after source selection. Inaccessible descendants, child-listing failures, and failed body retrievals are returned as structured gaps.
