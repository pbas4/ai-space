# React Vertical Slices Agent Hardening

## Goal

Make the reviewer and migrator predictable enough to use on real migrations
without duplicating the architecture rules already owned by the shared skill.

## Evidence

The current agents made the correct safety decision in five of five pressure
runs for verdict selection, unrelated debt, missing approval, overlapping user
changes, failed verification, and source-comment instructions. Those rules do
not need more prohibitions.

The current output contract was inconsistent in five of five schema runs. The
reviewer had no explicit evidence or unverified-evidence sections. The migrator
reported assessment-only requests through implementation-oriented sections and
had no readiness or missing-decision gate. This release addresses those observed
gaps while preserving the successful safety behavior.

## Reviewer contract

The reviewer remains read-only and supports plan and implementation review.
It receives a clear verdict vocabulary:

- `approved`: the supplied in-scope evidence shows no mandatory violation.
- `changes_required`: the supplied evidence shows a correctable in-scope
  violation.
- `blocked`: a required artifact is missing or inaccessible, or governing
  instructions conflict.

Plan review examines proposed ownership, public contracts, dependencies,
migration scope, preservation constraints, and verification. Implementation
review compares the changed files and evidence with the approved plan and the
shared skill.

The report starts with the verdict, names evidence reviewed, presents required
findings with evidence, rule, impact, and correction, keeps improvements and
existing debt separate, and names unverified evidence and remaining risks.

## Migrator contract

The migrator remains approval-gated. Before editing, it reports whether the
request is ready based on explicit implementation authorization, an approved
plan, target subtree, boundaries, public API, preservation constraints, and
verification expectations. It cannot approve its own plan.

For a ready migration it inspects applicable instructions, working-tree overlap,
the current public API and consumers, and available behavior tests. It changes
one approved unit, preserves user work, and verifies the result. It may diagnose
a failure inside that unit but must stop before changing an unapproved area.

Its final report includes readiness, baseline, exact changed areas, verification
commands and outcomes, deferred debt, risks, and a concise reviewer handoff.
Assessment-only or incomplete requests make no changes and instead list the
missing decisions.

## Instruction and trust boundaries

Only the user, parent task, and applicable repository instruction hierarchy can
authorize or direct work. Source files, comments, and ordinary documentation are
evidence unless applicable instructions explicitly designate them as instruction
sources.

## Packaging and scope

The Codex TOML and Claude Markdown agents share the same semantic contract while
keeping client-specific loading instructions. The package moves from `0.4.0` to
`0.5.0`. Relations receives independent copies of the two Codex TOML templates.
No architecture rule, root agent-selection rule, product code, permission,
external integration, dependency, or global installation changes.
