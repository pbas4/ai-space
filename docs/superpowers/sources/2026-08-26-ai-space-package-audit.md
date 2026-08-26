# AI Space Package Audit

Date: 2026-08-26

## Scope and evidence

Read-only audit of `packages/rw-crm/` and `packages/rw-create-task-plan/`, including package manifests, profiles, skills, shared modules, schemas, tests, and integration documentation.

Validation evidence at the time of the audit:

- `npm --prefix packages/rw-crm run validate` — 49 Node tests and package validation passed.
- `python3 -m unittest discover -s tests -v` in `packages/rw-create-task-plan/` — 15 tests passed.
- `python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .` in `packages/rw-create-task-plan/` — passed.
- `git diff --check` — passed.

## Findings

### High priority

1. **Model selection is declarative, not executed.**
   `runRwCrmOrchestrator` creates and approves model assignments, but does not pass the approved assignment to Planner, Plan Reviewer, Components Engineer, UI Reviewer, or PR Description Writer. It also does not read a selected preset from the request, so its default proposal is always `recommended`.

   Improve by making model selection an execution context, validating exact role assignments, and passing the approved assignment into every worker invocation. Test each preset and a confirmation-required escalation end to end.

2. **The Confluence descendant requirement is not connected to context discovery.**
   The context map contains a recursive `discoverConfluenceTree` helper, but `buildSourceIndex` stores only one Confluence root and no context adapter invokes the descendant traversal. The required Best Practices subtree rooted at `21790813` is therefore documented but not retrieved or indexed as task context.

   Improve by adding an injected Confluence adapter that discovers every descendant as metadata for each task, selects only applicable pages for body retrieval, records inaccessible pages, and refreshes stale selected sources. Keep the index task-scoped; do not claim permanent memory of all page bodies.

3. **UI routing is inconsistent between standalone and plugin flows.**
   RW CRM routes tasks containing generic UI terms such as `screen`, `form`, or `frontend`. Create Task Plan explicitly says generic UI wording without a Figma or component-specific reference is not UI-related. The same task can therefore take different routes depending on entry point.

   Improve by defining one evidence-producing shared classifier with `ui-related`, `possible-ui`, and `non-ui` results. The standalone package may offer work for `possible-ui`; the plugin should require confirmation before invoking RW CRM for that result. Both should report the same evidence and confidence.

4. **Approval records are insufficiently bound to the approved content.**
   The Engineer workflow trusts `approvedPlan.approval` and does not validate the request's plan approval. Approval records have no plan hash, and code-edit approval has no plan hash. A changed plan can therefore retain an approval record if the ID remains the same.

   Improve by introducing canonical plan and edit-manifest digests and immutable approval receipts. The plan receipt must bind plan ID, plan hash, approver, and timestamp. The code-edit receipt must additionally bind the edit-set hash. Revalidate both immediately before `implementationAdapter.apply`.

### Medium priority

5. **The package is a portable workflow framework rather than a complete operational integration.**
   The adapter boundary is documented but real Figma, Confluence, code, accessibility, visual, and test adapters are supplied by the host. Publish formal adapter contracts and a reference Codex-host adapter, or explicitly position the package as framework-only.

6. **Context is repeatedly rediscovered.**
   Orchestration, planning, plan review, implementation, and UI review independently call `contextAdapter.discover`. That increases cost and allows an approval to be based on a different context snapshot than implementation.

   Introduce a task-scoped context snapshot, provenance, freshness metadata, and a change check that requires reapproval if material context changes.

7. **Schemas and runtime validators diverge.**
   Several JSON schemas only require property names, while JavaScript validators enforce enums and workflow invariants. Some schema declarations allow values that the runtime rejects.

   Use one canonical validation definition or enforce the JSON schemas at every boundary. Add complete schemas for findings, approvals, verification evidence, and context provenance.

8. **Repository-specific policy is duplicated and loosely detected.**
   The PR writer uses a substring match to identify `rw-crm-components`, while version/changelog rules use Git remote and path conditions.

   Add one canonical target-repository policy resolver and reuse it for versioning, changelog, PR template, and repository-specific verification rules.

### Low priority and useful additions

9. Replace wording-only contract checks with behavior-level integration fixtures for plugin discovery, model propagation, routing parity, approval tampering, and Confluence descendant selection.

10. Standardize naming: use **RW CRM Components Planner** consistently instead of mixing it with **RW UI Components Planner**. Update stale historical design-plan references where they are still user-facing.

11. Add source allowlists for Figma, Confluence, and repository remotes before processing external links.

12. Add a dry-run audit report containing routing evidence, model assignments, approval receipts, source snapshot IDs, commands run, verification results, findings, and the PR draft.

13. Add an anonymized, versioned corpus of representative RW CRM tasks for routing and planning regression tests.

14. Add learning-ledger duplicate detection before proposing persistence of a user correction.

## Approved implementation focus

The current implementation plan addresses findings 1–4 only:

- executable model-routing and model-escalation confirmation;
- real task-scoped Confluence subtree indexing and on-demand retrieval;
- a shared evidence-based UI-routing policy for standalone and Create Task Plan flows; and
- content-bound plan and code-edit approval receipts.

The remaining findings remain intentionally deferred.
