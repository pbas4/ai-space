# Retro

A shared skill and three independently callable specialists turn supplied session
corrections into scoped, verifiable improvements: an interviewer, rule designer,
and verifier. The skill coordinates them sequentially; no fourth agent is needed.
Initial release: `0.1.0` for Codex and Claude Code.

## Install and invoke

After publication, Claude Code marketplace installation:

```text
/plugin marketplace add pbas4/ai-space
/plugin install retro@ai-space
/retro:retro Review this session and propose improvements.
```

If already registered, refresh with `/plugin marketplace update ai-space`.
For local development, from the repository root:

```bash
claude --plugin-dir "$PWD/packages/retro"
```

For Codex local development, register this checkout from the repository root,
then install the plugin:

```bash
codex plugin marketplace add .
codex plugin add retro@ai-space
```

After publication, use `codex plugin marketplace add pbas4/ai-space` to register
the remote marketplace instead. Remote installation requires the release to have
been published. Start a new Codex session after installation so skill discovery
refreshes, then invoke:

```text
$retro Review the supplied session notes and propose improvements.
```

`/retro` is the conceptual workflow name; plugin installations use the client's
namespaced command above. Codex metadata disables implicit skill invocation.
The shared entrypoint requires an explicit request in both clients; this is an
instruction contract, not a guarantee of Claude discovery isolation.

## Install the Codex custom agents separately

Plugin skill installation does not promise to register custom TOML agents.
In a project that chooses this workflow, copy the three definitions from this
checkout into that target project's supported `.codex/agents/` directory:

```bash
mkdir -p /path/to/target-project/.codex/agents
cp packages/retro/agents/retro_*.toml /path/to/target-project/.codex/agents/
```

For personal installation, use `~/.codex/agents/` instead. These are optional
user-run setup commands, not actions performed by a retrospective. Ensure the
`retro` skill is installed and available in the target environment. Copied
wrappers resolve their reference through the loaded skill, so they need no
relative path back to this checkout. Review and update copies deliberately.

```text
Use the retro_interviewer agent with these supplied notes to identify evidenced corrections.
Use the retro_rule_designer agent to propose enforcement for finding F1; do not implement.
Use the retro_verifier agent to review proposal P1 against finding F1.
```

## Claude agents

Claude discovers the Markdown agents through the installed plugin or
`--plugin-dir`; each preloads the fully qualified `retro:retro` plugin skill and
enters its specialist mode without ambiguity from another skill named `retro`.
They can also be called independently:

```text
Use the retro:retro-interviewer agent with these supplied notes.
Use the retro:retro-rule-designer agent to propose improvements for finding F1.
Use the retro:retro-verifier agent to review proposal P1.
```

| Role | Codex name | Claude name | Contract |
| --- | --- | --- | --- |
| Interviewer | `retro_interviewer` | `retro-interviewer` | Read-only evidence and focused questions |
| Rule designer | `retro_rule_designer` | `retro-rule-designer` | Proposals; edits only for authorized implementation |
| Verifier | `retro_verifier` | `retro-verifier` | Read-only source review; known checks may create disposable output |

Claude tool lists reflect these roles. Codex wrappers describe behavioral
boundaries and inherit parent permissions; they do not claim separate tool or
filesystem isolation. All three prohibit redelegation. No model is pinned.

## Workflow and scope

Supply the repository, accessible conversation or session notes, and desired
mode. The workflow uses that evidence and relevant diffs/rules; it neither
assumes hidden history nor searches other chats. The interviewer returns
questions for the coordinator to ask one at a time. Findings retain stable IDs,
observed/user-reported/unknown recurrence, and clearly marked cause inferences.

The designer inspects existing enforcement and prefers narrow checks using
existing tools. Each proposal includes scope, target files, fail/pass examples,
verification, and false-positive risks. Product defects and workflow defects
are distinguished. No change is a valid result; judgment remains judgment.

A retrospective request authorizes investigation and proposals. Existing
explicit authorization permits selected implementation without repeated approval
requests. The verifier independently reviews proposals, then authorized changes,
requiring actual offending-fails/valid-passes evidence for executable checks.
One in-scope correction and re-review is allowed before reporting unresolved
issues. Proposal approval is not implementation approval or a passing test claim.

Reports stay in conversation unless saving is requested or required by target
repository convention. Raw transcripts are not stored by default. The workflow
does not incidentally commit, install hooks, change permissions, or modify
persistent configuration. Separately authorized commits retain applicable
authorship confirmation requirements.

If delegation/agents are unavailable, disclose that limitation and stop
orchestration. A single-agent walkthrough is available when requested and must
not claim independent verification. Prompts do not make model behavior deterministic.

## Example check and validation

The read-only example checks **only the two package manifests**, not marketplace
metadata. Matching valid SemVer strings exit `0`; drift, malformed/missing
versions, invalid JSON, missing manifests, or a missing argument exit `1` with
diagnostics. It prints checked paths and never edits files.

```bash
node packages/retro/examples/check-plugin-versions.mjs packages/retro
```

From the repository root, with Node.js, Python 3.11+, and Ruby with its standard
YAML/JSON libraries (used only by packaging tests):

```bash
python3 -m unittest discover -s packages/retro/tests -v
python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" packages/retro/skills/retro
python3 "$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" packages/retro
claude plugin validate packages/retro --strict
claude plugin validate packages/retro/agents --strict
claude plugin validate packages/retro/skills --strict
node scripts/validate-marketplaces.mjs
git diff --check
```

The external Python validators require PyYAML and their corresponding installed
skill files. Availability and results must be reported honestly. Package tests
use real YAML/TOML parsing, subprocess fixtures for reject/accept behavior, and
isolated marketplace-drift/alias checks. They are static packaging and executable
CLI checks, not live multi-agent verification. Use
[behavior-scenarios.md](tests/behavior-scenarios.md) for fresh-agent evaluations;
record actual outcomes separately from these contracts.
