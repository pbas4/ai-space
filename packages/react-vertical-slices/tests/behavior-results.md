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

The same ten prompts were repeated in fresh Codex contexts with the shared skill
enabled. The evaluator read only the reference routed by `SKILL.md` for each
prompt.

| Scenario | Codex with skill | Observation |
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

## Repeated high-risk samples

Four decisions were sampled five times in fresh Codex contexts with no guidance
and five times with the skill. A sample passed only when it made every required
architectural decision; exact wording was not scored.

| Decision | No-guidance control | Skill enabled | Result |
| --- | ---: | ---: | --- |
| Container/component separation | 1/5 | 5/5 | The skill consistently applied the named `containers/` and `components/` convention. |
| Cross-slice type ownership | 5/5 | 5/5 | The skill preserved already-strong reasoning and made the three valid resolutions explicit. |
| Sharing after a second use | 5/5 | 5/5 | Both groups rejected count-based extraction; the skill supplied a stable decision checklist. |
| Explicit repository conflict | 5/5 | 5/5 | Both groups surfaced the conflict and paused for approval. |

The control result matters: this skill is not intended to replace general React
judgement. Its value is making this particular architecture predictable,
especially where a team needs a common folder vocabulary rather than a merely
reasonable separation of concerns.

## Known limitations

- Claude Code was not installed on the test machine. Its baseline, post-skill,
  strict plugin validation, and command-discovery checks remain to be run in an
  environment with the Claude CLI.
- VS-11 through VS-21 are documented template scenarios. Each remains pending
  because the templates are deliberately not installed automatically and the
  required fresh-context project fixtures have not yet been prepared.
- These are instruction-following scenarios, not a measurement of long-term
  maintainability in a production codebase.
- Repository-specific rules can intentionally prevent this architecture. The
  skill surfaces that conflict instead of choosing for the repository.
