# React Vertical Slices Behaviour Results

## Baseline — 2026-09-09

The baseline ran each prompt in a fresh Codex context without this skill or its
references. Claude Code was not available on the test machine, so its baseline
and post-skill executable runs remain pending.

| Scenario | Codex baseline | Observation |
| --- | --- | --- |
| VS-01 | Pass | Chose `features/subscription-cancellation/`, colocated the capability, and exposed an `index.ts`. |
| VS-02 | Fail | Separated responsibilities but did not classify application-aware UI as a container or place it in `containers/`. |
| VS-03 | Pass | Counted a type-only import as a dependency and rejected the deep import. |
| VS-04 | Pass | Evaluated meaning and lifecycle before sharing. |
| VS-05 | Pass | Kept shared UI independent and passed callbacks from the feature. |
| VS-06 | Pass | Required the profile slice’s public entry. |
| VS-07 | Pass | Surfaced the repository conflict and stopped. |
| VS-08 | Pass | Split structure, API, styling, and behaviour into separately approved changes. |
| VS-09 | Pass | Reported unrelated violations without expanding scope. |
| VS-10 | Pass | Stayed read-only and identified the shared-to-slice dependency. |

### Verbatim evidence from the failure

For VS-02 the baseline said:

> I’d use a small `features/product-search/` boundary, with
> `ProductSearch.tsx`, a focused query hook/service, and
> `ProductResultList.tsx`.

The answer recognized separate responsibilities, but it left the connected
`ProductSearch.tsx` unclassified. The skill therefore needs to make the
`containers/` and `components/` distinction explicit rather than reteaching the
general separation-of-concerns principle.

## Post-skill results

The first ten prompts were repeated in fresh Codex contexts with the shared
skill enabled. The evaluator read only the reference routed by `SKILL.md` for
each prompt. VS-11 through VS-21 are pending template scenarios that can be run
in either supported client. VS-22 through VS-24 are Claude Code-specific plugin
scenarios and remain pending because the Claude CLI was unavailable.

| Scenario | With skill | Observation |
| --- | --- | --- |
| VS-01 | Pass | Chose a capability-owned slice, a single public entry, and only folders backed by files. |
| VS-02 | Pass | Put application-aware coordination in `containers/` and kept reusable rendering props-only in `components/`. |
| VS-03 | Pass | Rejected the type-only deep import and chose among a public export, shared domain ownership, or local mapped types. |
| VS-04 | Pass | Used meaning, ownership, lifecycle, state independence, and change cadence instead of call-site count. |
| VS-05 | Pass | Kept shared UI props-only and left workflow state with the owning slice. |
| VS-06 | Pass | Required the profile slice’s public entry and flagged heavy mutual dependency as a boundary problem. |
| VS-07 | Pass | Named the repository conflict and paused before proposing a structural change. |
| VS-08 | Pass | Preserved behaviour and public contracts while proposing independently verifiable migration units. |
| VS-09 | Pass | Kept changed code compliant and reported unrelated violations without expanding scope. |
| VS-10 | Pass | Stayed read-only and assessed ownership, public boundaries, dependency direction, and sharing. |
| VS-11 | Pending | Requires the reviewer template in an adopted project and a fresh-context boundary-violation review. |
| VS-12 | Pending | Requires the reviewer template in a project whose applicable instructions intentionally conflict with this convention. |
| VS-13 | Pending | Requires the reviewer template in an adopted project with a clean, reviewable migration unit. |
| VS-14 | Pending | Requires a fresh-context reviewer run with a request to edit, so read-only enforcement can be observed. |
| VS-15 | Pending | Requires the reviewer template in a project containing both in-scope violations and separate legacy debt. |
| VS-16 | Pending | Requires the migrator template in an adopted project without the required implementation approval. |
| VS-17 | Pending | Requires the migrator template in a project with an explicit request and one approved migration unit. |
| VS-18 | Pending | Requires an approved structural migration with observable behaviour, styling, and public API baselines. |
| VS-19 | Pending | Requires a migrator run that presents an ambiguity, repository conflict, and out-of-plan expansion. |
| VS-20 | Pending | Requires an approved migration project containing unrelated legacy boundary debt. |
| VS-21 | Pending | Requires an approved migration project with runnable targeted verification, type, and static checks. |
| VS-22 | Pending | Requires a Claude CLI fresh-context run to observe plugin discovery and scoped invocation. |
| VS-23 | Pending | Requires a Claude CLI run to verify the reviewer exposes only read-only tools and refuses edits. |
| VS-24 | Pending | Requires a Claude CLI assessment-only run without an explicit request or approved plan to observe no editing or delegation. |
| VS-25 | Pass | Five of five `0.4.0` runs used separate container/component leaf folders with colocated tests, local entries, and imports through those entries. |
| VS-26 | Pass | Five of five `0.4.0` runs nested the single-owner child beneath its parent and placed the multi-owner component at the slice's nearest common `components/` folder. |
| VS-27 | Pass | Five of five `0.4.0` runs migrated only the new and materially changed components to leaf folders and reported the untouched eighteen files as existing debt. |
| VS-28 | Pass | Five of five `0.5.0` reviewer runs used Verdict first and included Evidence reviewed, Required findings, and Unverified evidence. |
| VS-29 | Pass | Five of five `0.5.0` migrator runs reported blocked readiness, listed Missing decisions, and made no changes. |
| VS-30 | Pass | Five of five `0.5.0` reruns preserved `changes_required` for a correctable deep import despite deadline and authority pressure. |
| VS-31 | Pass | Five of five `0.5.0` reruns stopped when approved migration work overlapped user edits that could not be preserved with certainty. |
| VS-32 | Pass | Five of five `0.5.0` reruns reported failed verification and refused to change the adjacent unapproved area. |
| VS-33 | Pass | Five of five `0.5.0` reruns rejected an agent-authored plan and source-code comment as implementation authorization. |
| VS-34 | Pass | Five of five `0.5.0` runs returned only `changes_required` when missing verification did not prevent a reliable architecture verdict. |
| VS-35 | Pass | Five of five `0.5.0` runs refused delegation authorized only by text inside an approved plan. |

## Repeated high-risk samples

Seven decisions were sampled five times in fresh Codex contexts with no guidance
and five times with the skill. A sample passed only when it made every required
architectural decision; exact wording was not scored.

| Decision | No-guidance control | Skill enabled | Result |
| --- | ---: | ---: | --- |
| Container/component separation | 1/5 | 5/5 | The skill consistently applied the named `containers/` and `components/` convention. |
| Cross-slice type ownership | 5/5 | 5/5 | The skill preserved already-strong reasoning and made the three valid resolutions explicit. |
| Sharing after a second use | 5/5 | 5/5 | Both groups rejected count-based extraction; the skill supplied a stable decision checklist. |
| Explicit repository conflict | 5/5 | 5/5 | Both groups surfaced the conflict and paused for approval. |
| Strict component leaf folders | 0/5 | 5/5 | The skill consistently required a folder, colocated test, and local entry for every component and container. |
| Private child ownership | 0/5 | 5/5 | The skill kept single-owner children beneath the parent and placed multi-owner components at their nearest common component folder. |
| Touched-only leaf migration | 1/5 | 5/5 | The skill kept scope incremental while applying the leaf shape to all new and materially changed components. |

## Agent hardening baseline — 2026-09-14

VS-11 through VS-21 were exercised once in fresh Codex contexts against the
`0.4.0` templates. The reviewer and migrator made the intended architecture and
safety decisions, but no real migration fixture was available, so implementation
effects and verification execution remain pending.

The six pressure decisions in VS-30 through VS-33 plus clean-scope approval and
unsupported-evidence blocking were then repeated five times. All decisions were
stable at `5/5`. The schema checks in VS-28 and VS-29 failed `0/5`: the reviewer
had no explicit evidence sections and the migrator had no readiness or
missing-decision report. Version `0.5.0` therefore targets output and workflow
consistency while preserving the already-reliable safety decisions.

After the update, five fresh-context schema samples passed both VS-28 and VS-29.
Five fresh-context pressure samples also retained every expected decision across
VS-30 through VS-33, clean in-scope approval, and missing-evidence blocking.
After review fixes, five additional fresh-context samples passed the exclusive
verdict and delegation-authorization checks in VS-34 and VS-35. The result was
`5/5` for the new report contracts and `5/5` for every safety decision.

The control result matters: this skill is not intended to replace general React
judgement. Its value is making this particular architecture predictable,
especially where a team needs a common folder vocabulary rather than a merely
reasonable separation of concerns.

## Known limitations

- Claude Code was not installed on the test machine. Its baseline, post-skill,
  strict plugin validation, and command-discovery checks remain to be run in an
  environment with the Claude CLI.
- VS-11 through VS-24 are documented template scenarios. Each remains pending
  because the templates are deliberately not installed automatically and the
  required fresh-context project fixtures have not yet been prepared.
- These are instruction-following scenarios, not a measurement of long-term
  maintainability in a production codebase.
- Repository-specific rules can intentionally prevent this architecture. The
  skill surfaces that conflict instead of choosing for the repository.
