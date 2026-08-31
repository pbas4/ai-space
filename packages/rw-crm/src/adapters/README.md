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

`createCodexHostAdapter(host, sourcePolicy)` accepts a host with `discoverCandidates`, `retrieveSource`, `refreshContext`, `proposeImplementation`, `applyImplementation`, and `verify` functions. `discoverCandidates` returns descriptors only. The adapter calls `sourcePolicy.authorizeSource(candidate)` for every descriptor before it calls `retrieveSource`; rejected descriptors become `{ sourceId, reason, impact: 'source was rejected before retrieval' }` gaps.

Hosts may additionally expose `inspectFigma`, `inspectVisual`, and `checkAccessibility`. These optional evidence helpers are read-only and return `{ findings, gaps }`; generic hosts are not required to provide them.

`createSourcePolicy(...).authorizeSource(source)` normalizes approved Figma and Confluence HTTPS hosts, bare numeric Confluence page IDs, `confluence://<id>` values, and Git remotes. HTTPS Figma and Confluence sources require approved hosts; an ID-only Confluence descriptor has no host to authorize. Repository sources require an approved normalized Git remote.

The Confluence adapter defaults to root page `21790813`. `listChildren(pageId)` supplies read-only descendant metadata; every reachable descendant is indexed for the task. `fetchPage(source)` retrieves bodies only after source selection. Inaccessible descendants, child-listing failures, and failed body retrievals are returned as structured gaps.
