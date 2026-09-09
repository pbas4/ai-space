# RW CRM Medium/Low Hardening — Design Specification

## Purpose and scope

Strengthen the reusable RW CRM package and its Create Task Plan consumer by addressing every deferred medium- and low-priority finding in [the package audit](../sources/2026-08-26-ai-space-package-audit.md), findings 5 through 14. The work remains independent of the earlier high-priority hardening and must preserve its approval gates, model-routing contract, and UI-routing policy.

The work is delivered as five independently testable implementation slices:

1. formal operational adapter contracts and a reference Codex-host adapter;
2. a shared, task-scoped context snapshot with provenance, freshness, and reapproval on material change;
3. aligned schemas and runtime validation at package boundaries;
4. one canonical resolver for RW repository-specific policy; and
5. quality and safety additions: behavior-level integration fixtures, source allowlists, dry-run audit reports, an anonymized regression corpus, learning-ledger duplicate detection, and user-facing planner naming cleanup.

The package remains a portable workflow package: production Figma, Confluence, code, visual, accessibility, and test integrations are still host-provided. Its contracts and reference adapter make that boundary operational and testable rather than implicit.

## Context and policy design

Every orchestration run creates one immutable task-scoped context snapshot after discovery. The snapshot records source identities, retrieval timestamps, selected source bodies, discovery gaps, provenance, and a deterministic snapshot identifier. Planner, Plan Reviewer, Components Engineer, UI Reviewer, and PR writer receive the same snapshot rather than rediscovering context independently.

Before code edits are proposed and again immediately before edits are applied, the workflow checks selected sources for material changes. If a material change is detected, it reports the delta, invalidates the approved plan and any edit proposal derived from it, and requires a refreshed plan plus explicit reapproval. Transient retrieval failure is reported as a context gap and stops the affected write stage; it must not be treated as unchanged context.

All external Figma URLs, Confluence URLs/page identifiers, and repository remotes are checked by an explicit source allowlist before a host adapter retrieves or acts on them. Disallowed or unknown sources are reported with the attempted source and applicable policy; no retrieval or mutation follows.

## Contracts and repository policy

The package exposes complete schemas and matching runtime validation for context provenance, review findings, approval receipts, verification evidence, model execution assignments, and dry-run reports. JSON schemas are applied at every public boundary and use the same allowed values and required invariants as runtime validators. A validation failure returns structured errors; it never silently coerces unsafe input.

One canonical repository-policy resolver determines whether a task targets `rw-crm-components` using normalized repository remote and path evidence. It supplies the same result to version/changelog obligations, the PR-description template, and repository-specific verification. A target is considered RW CRM components only when the resolver has positive evidence; an ambiguous target is reported and does not trigger repository-specific mutations.

## Quality additions

Behavior-level fixtures validate plugin discovery, approved model propagation to workers, routing parity, approval-receipt tampering, Confluence-descendant selection, context-change reapproval, and repository-policy decisions. An anonymized, versioned corpus of representative RW CRM task inputs drives routing and planning regression checks without customer data.

The dry-run report is a read-only, structured artifact containing routing evidence, proposed model assignments, approval receipt state, source snapshot identifiers and gaps, commands that would run or did run, verification evidence, findings, and a PR-description draft when applicable. It contains no tokens, credentials, or full inaccessible source bodies.

Learning-ledger persistence compares a proposed lesson with existing stable rules and task-specific exceptions before asking for persistence. It reports an exact duplicate or likely overlap and requires an explicit user choice to discard, link, or create a distinct entry. User-facing references consistently use **RW CRM Components Planner**; historical filenames may remain when they are not user-facing.

## Bounded heartbeat execution controller

A project-level heartbeat controller executes the eventual implementation plan one independently testable slice at a time. It is orchestration only: it does not replace any RW CRM agent, adapter, source-policy, or approval behavior.

Each heartbeat run:

1. reads the plan state and selects only the next unchecked task;
2. verifies the repository state and task prerequisites;
3. displays the proposed model/effort assignment and exact planned edit scope;
4. stops for any plan or code-edit approval required by the RW CRM workflow;
5. after approval, performs only the selected task, runs its explicit verification, and records outcome evidence; and
6. schedules a later run only when the task completed cleanly and the next task requires no immediate user decision.

The controller stops rather than continues when context is missing or disallowed, a source changes materially, tests fail, unrelated uncommitted changes are present, the plan requires a material amendment, or an external write such as commit, push, merge, publishing, or plugin installation would be needed. It never performs those external writes automatically. Each run emits a concise status containing task, state, evidence, blocker if any, and whether another run is scheduled.

The controller is represented by a durable prompt-loop document with state format, prompt templates, stop rules, and a manual invocation example. A Codex heartbeat automation invokes that document only after the implementation plan has been approved. The automation is bounded: it cannot continuously execute after a blocker or user-decision point.

## Validation and acceptance

Acceptance requires the existing package and plugin validation suites to remain green, plus direct tests for each contract, policy, context, report, corpus, and controller stop condition introduced above. At minimum, tests demonstrate:

- a reference host can satisfy the adapter contract and rejected adapter responses are structured;
- all workers use one snapshot and material source changes invalidate approval;
- schema and runtime validators agree on accepted and rejected envelopes;
- the resolver governs every RW CRM components-specific rule consistently;
- allowlists block untrusted sources without retrieval;
- dry-run reports are complete but contain no secrets;
- the corpus catches a routing/planning regression;
- a duplicate learning lesson is not persisted without a user decision; and
- the heartbeat controller completes one task, then stops correctly for approval, failure, source change, and unrelated working-tree changes.

## Scope boundary

This design does not implement adapters against live services, bypass user approval, introduce autonomous commits/pushes/merges, or change the existing Create Task Plan plugin beyond its documented consumer integration. The detailed implementation plan will define exact files, TDD steps, verification commands, and the heartbeat prompt-loop artifact.
