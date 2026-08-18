# Focused adapter boundary

Adapters provide evidence to `runEngineerWorkflow`; they do not own component decisions.

```js
contextAdapter.discover(request) -> Promise<ContextReport>
implementationAdapter.propose(context, request) -> Promise<Plan>
implementationAdapter.apply(plan, approvedEdits) -> Promise<string[]>
verifier.run(scope, changedArtifacts) -> Promise<VerificationReport>
```

Implementations may connect Figma, UI-library, CRM-code, testing, visual, or accessibility helpers. The package remains independently usable with deterministic adapters and does not modify the Create Task Plan plugin.
