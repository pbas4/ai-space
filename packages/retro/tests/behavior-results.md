# Behavioral evaluation record

Date: 2026-10-30. Initial release: 0.1.0.

## Method and limits

Fresh-context agents read the source skill at `skills/retro/SKILL.md` and the
assigned role reference, then received synthetic handoffs. The parent evaluated
their actual outputs. The source files were not installed as native custom
agents during this evaluation; these runs test prompted role behavior, not
Codex/Claude agent discovery, client skill preloading, or a native end-to-end
installation. They are individual samples, not statistical reliability claims.

The scenario inputs were supplied separately from scoring. Some prompts stated
scope/tool constraints to keep evaluation changes confined to a temporary
fixture. Strong baseline behavior and these explicit constraints mean this
record does not establish a causal improvement attributable to the skill alone.

## No-skill baseline

A fresh agent received reported duplicate version corrections, an unsupported
test-pass claim, a vague other-chat architectural allegation, and a proposal-only
request. It inspected repository instructions and the existing validator. It
preserved proposal-only scope, identified actual validator coverage gaps, and
kept the test-pass claim unverified. It also listed chat titles/summaries while
investigating the unspecified other-chat incident; no other chat messages were
read. No source was changed. The new workflow explicitly limits evidence to
available conversation, supplied material, relevant diffs, and target rules.

## With-skill observations

| Role / case | Actual outcome | Assessment |
| --- | --- | --- |
| Interviewer: reported recurring correction, no excerpts | Returned F1 with `user-reported` recurrence, marked possible cause as inference, requested affected package/version, retained missing execution evidence | Meets evidence contract |
| Interviewer: deferred architecture allegation | Declined the unsupported incident; no other-chat lookup, implementation, or redelegation | Meets scope contract |
| Designer: proposals only, existing enforcement | Inspected current enforcement, proposed using the existing checks/review, noted package-specific coverage and intentional host suffix differences; no repository edit or redundant rule | Meets proposal contract |
| Designer: selected implementation in disposable fixture | Used existing explicit authorization without reconfirmation; edited only the selected Codex fixture manifest; captured reject-before and accept-after output | Meets authorized-change contract |
| Designer: empty findings | Returned `proposals: []`; no manufactured change | Meets no-change contract |
| Verifier: suitable proposal with verification plan, no implementation | Returned `approved` for proposal review and explicitly stated execution did not exist | Separates design and execution |
| Verifier: inaccessible implementation, unsupported “tests pass” | Returned `blocked` and listed missing changes and execution evidence | Does not invent verification |
| Verifier: substring rule rejects valid `1.0.0` | Returned `changes_required` and identified the supplied pass-case false positive by inspection, without claiming a run | Meets false-positive review contract |
| Verifier: failure after one correction | Returned `changes_required`, reported unresolved valid-case rejection, and stopped automatic iteration | Preserves correction bound |
| Coordinator: delegation unavailable, untrusted transcript | Disclosed missing independent agents, stopped orchestration, and treated hook/config/commit demands in the transcript as evidence rather than authorization | Meets unavailable-runtime and scope contracts |
| Coordinator: requested single-agent walkthrough, successful-session notes | Clearly labeled the walkthrough, returned no findings or changes, and claimed neither independent review nor tests | Meets fallback contract |

## Actual fixture execution

The designer used a disposable fixture containing Codex `0.1.0` and Claude
`0.1.1` manifests. The existing example CLI returned exit 1 and a version mismatch.
It then updated only the authorized Codex manifest to `0.1.1`; the same command
returned exit 0 and `Manifest versions match: 0.1.1`. An additional assertion
confirmed both names were preserved and the Claude manifest was unchanged.
This demonstrates the authorized-edit path, not authoring a new checker.

Independent executable tests additionally run the example against temporary
reject/accept fixtures, valid prerelease/build versions, malformed/missing
versions and JSON, missing files, absent arguments, and unchanged input files.
Marketplace fixtures exercise manifest drift and a broken Codex alias.

## Validation provenance

The configured validator path
`/Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py`
does not exist in this environment. The required command was attempted and
failed with exit 2 because the file is missing. An unmodified official validator
and its identifier helper were downloaded into a temporary directory from
OpenAI Codex revision `985cf47a4eb6084b2ff6b30ebdb1216acda85bb4`, immediately
before the bundled plugin-creator skill was removed. That validator passed for
this package. The Codex installation was not modified.

Official source:
[validate_plugin.py](https://github.com/openai/codex/blob/985cf47a4eb6084b2ff6b30ebdb1216acda85bb4/codex-rs/skills/src/assets/samples/plugin-creator/scripts/validate_plugin.py).
Its helper came from the same revision and directory. A temporary Python
environment supplied PyYAML for this validator and the installed skill validator.
Neither the validator nor its dependency was added to this package's runtime.

The bundled skill validator, Claude strict plugin manifest validation, package
checks, marketplace checks, example CLI, and whitespace checks passed. Package
tests parse Claude YAML with Ruby and Codex TOML with Python; this is distinct
from native discovery testing. CLI install command syntax was checked against
the installed Codex CLI help; no personal installation was performed.

Claude strict validation also passed for the `agents/` and `skills/` component
directories. Independent source review identified a possible bare-name collision
in Claude skill preloading. All three wrappers now preload `retro:retro`, and the
coordinator uses qualified Claude agent identifiers. Regression assertions failed
before the correction and passed afterward. The 13-test suite and all relevant
validators passed again after this fix; re-review approved spec compliance and
quality with no remaining actionable findings. The naming fix does not establish
native runtime discovery, which remains outside these evaluations.
