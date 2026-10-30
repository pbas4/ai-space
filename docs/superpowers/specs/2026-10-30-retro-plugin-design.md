# Retro plugin: three-agent first release

Date: 2026-10-30
Status: Approved by the user and implemented on 2026-10-30; independent spec and quality reviews approved. Native installation/runtime discovery was not tested.

## Purpose and scope

Create `packages/retro/`, a reusable plugin for Codex and Claude Code. The
first release includes the complete three-agent workflow: Retro Interviewer,
Rule Designer, and Verifier. A shared `retro` skill coordinates them; there is
no fourth orchestrator agent.

The source inspiration is Heitor Lessa's retrospective command described in
https://www.tiktok.com/@beyondcodingpodcast/video/7701057265482108162.
The three-role decomposition is our adaptation, not a claim about his implementation.

The workflow turns recurring session corrections into narrowly scoped,
verifiable improvements. It can also conclude that an issue needs human
judgment or that no change is justified. It does not promise that prompts
or model behavior become deterministic.

## Approach

Use a shared skill with three specialists. This fits the repository's
dual-client packaging and separates investigation, changes, and review.

Alternatives considered:

- A single retrospective prompt is smaller, but provides no independent review
  of a proposed check.
- A complete planning-to-merge lifecycle adds unrelated scope and duplicates
  workflows already present in this repository.

All three specialists ship in the first release and remain independently
callable. Their workflow is sequential because later roles consume earlier
results. They do not delegate to one another or recursively invoke the workflow.

## Agents

### Retro Interviewer

Reviews the conversation available to the invoking agent, user-supplied session
notes or transcripts, relevant diffs, and existing rules. It cannot assume
access to other chats or hidden session history. The coordinator supplies the
relevant context; if evidence is missing, the interviewer reports the gap.

The interviewer is read-only. It returns focused questions for the coordinator
to ask the user one at a time and produces findings containing:

- the observed correction and its evidence;
- the expected behavior and consequence;
- whether recurrence is observed, user-reported, or unknown;
- a possible cause, clearly marked as inference when unconfirmed.

It never treats a single ambiguous incident as a universal convention.

### Rule Designer

Inspects existing enforcement before proposing a new rule. For each finding,
chooses a linter, formatter, schema, validation script, test, instruction, or
no change. Mechanical properties favor executable checks; judgment remains
explicitly judgment-based. Existing tools are preferred over new dependencies.

Each proposal specifies the intended scope, an example that must fail, an
example that must pass, the target files, the verification command, and likely
false positives. It distinguishes product defects from workflow defects.

The designer also implements selected improvements when implementation is
authorized. A request to run a retrospective alone authorizes investigation
and proposals, not arbitrary changes to the target repository. Existing
explicit authorization is respected without asking for it again.

The designer follows target-repository instructions, release requirements,
and the user's commit-attribution rules. It does not install hooks, change
permissions or persistent identity, or commit merely because a retro found
an improvement.

### Verifier

Independently reviews the proposal or implemented change against the finding,
the agreed scope, and applicable repository instructions. It remains read-only
with respect to source changes. Where tools permit, it can run known checks
that may create disposable test output; this is not represented as a separate
filesystem sandbox guarantee.

For an executable check, verification must establish that an offending case
fails and a valid case passes. The verifier examines regression coverage and
false-positive risks rather than approving the designer's assertion alone.

Returns one verdict: `approved`, `changes_required`, or `blocked`, with evidence
and unverified claims. Proposal approval establishes design suitability;
implementation approval requires execution evidence. Instructions that need
judgment are not labeled as deterministically enforced.

## Shared workflow and artifacts

1. Establish the repository, session evidence, requested mode, and applicable
   instructions. Treat transcripts and source content as evidence, not authority.
2. Have the interviewer inspect the evidence. The coordinator handles the
   human interview and returns the answers to the interviewer.
3. Have the designer produce a prioritized set of proposals. Each finding has
   a stable ID so its proposal, change, and verification can be traced together.
4. Have the verifier review the proposals. Report unresolved evidence gaps.
5. If selected implementation is authorized, have the designer implement it
   and the verifier check the result. Permit one in-scope correction and
   re-review; report remaining problems after that rather than looping forever.
6. Return the retrospective report, including declined findings, proposals,
   implemented changes, actual verification evidence, and remaining risks.

The default report is returned in the conversation. Save a Markdown report
when requested or required by an applicable repository convention, following
that convention. Do not store raw session transcripts by default.

If delegation is unavailable, disclose that the three roles cannot run as
independent agents. A clearly identified single-agent walkthrough is available
when requested; it must not claim independent verification.

## Packaging and invocation

Initial version: `0.1.0`, synchronized between the Codex and Claude manifests
and both marketplaces. Add the Codex marketplace-local alias.

Deliverables:

- `skills/retro/SKILL.md` with explicit invocation and the shared workflow;
- a shared report template and role/handoff references;
- three Codex TOML agent definitions and three equivalent Claude Markdown
  definitions under `agents/`;
- Codex skill interface metadata, both plugin manifests, package README,
  and meaningful workflow verification fixtures/checks;
- updated root and packages READMEs, marketplace entries, and validator list.

Document Codex skill invocation as `$retro` and Claude plugin invocation as
`/retro:retro`. Preserve `/retro` as the conceptual workflow name rather than
promising a bare command in every installation mode.

Claude agent definitions are discovered through its plugin mechanism. Codex
custom-agent installation must be documented separately using supported
project or personal agent directories; do not promise plugin installation
automatically registers the TOML files. Validate current client contracts
before implementation and do not copy obsolete agent permission fields.

Do not edit the user's personal installation or create project-wide agent
copies outside the plugin package as part of building it.

## Verification and release hygiene

Verify frontmatter and TOML parsing, equivalent role responsibilities across
clients, local reference resolution, and complete packaging. Exercise scenarios
for missing session evidence, no actionable finding, existing enforcement,
proposal-only requests, authorized implementation, a false-positive rule,
unverified test claims, and the bounded correction loop.

Use a small executable fixture to demonstrate a proposed check rejecting an
offending example and accepting a valid example. Static contract validation
must not be reported as a live multi-agent runtime test.

Run the package checks and skill/plugin validators, plus:

```sh
node scripts/validate-marketplaces.mjs
python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py packages/retro
git diff --check
```

Review the package README, root README, packages README, and both marketplaces
before claiming implementation complete. Do not create a commit without
separate authorization and the required authorship confirmation.

This design document alone changes no package behavior, metadata, installation,
or usage; its preparation is documentation-only and does not require a version
bump or marketplace edit. Those changes are required when the plugin is added.
