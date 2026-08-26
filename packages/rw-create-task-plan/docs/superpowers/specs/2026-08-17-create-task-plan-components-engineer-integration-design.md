# Create Task Plan: Components Engineer integration

## Goal

Enrich UI-related Jira planning with structured findings from the independently
installed RW CRM Components Engineer, while retaining explicit manual Create
Task Plan invocation and the existing read-only planning workflow for all other
work.

## Scope and boundaries

- Keep Create Task Plan explicitly invoked through its existing command or
  direct skill invocation. Do not make it implicit.
- Begin each run by classifying the retrieved Jira issue before repository
  analysis or planning.
- Keep Jira, Figma, repository analysis, and planning read-only in this stage.
- Do not modify the Components Engineer, its installation, its tools, or its
  own instructions.
- Do not change non-UI task analysis, clarification, Superpowers planning, or
  branch/commit workflow except for consuming the required structured UI finding
  for a UI-related issue.

## UI-task classification

Classify a Jira issue as UI-related when either condition is true:

1. Retrieved Jira evidence contains a Figma URL or design reference.
2. The title, description, acceptance criteria, labels, linked work, or other
   retrieved Jira evidence explicitly identifies a CRM UI-library component,
   component-library change, or reusable UI component work.

Record the classification as `ui_related` or `non_ui`, together with the
evidence that produced it. Do not infer UI-related status merely from generic
words such as "screen", "frontend", or "UI" without component-specific or
design-reference evidence.

## Components Engineer invocation

For every `ui_related` issue, discover whether the independently installed RW
CRM Components Engineer is available, then invoke it once before Create Task
Plan synthesizes gaps and creates its plan. Supply a read-only request that
contains:

- Jira key, URL, issue type, title, description, acceptance criteria, labels,
  attachments, links, and related issues available from the Rovo retrieval;
- the evidence supporting UI classification; and
- every detected Figma URL or design reference.

The integration must not invent the engineer's skill name, MCP tool names, or
output. It discovers its available invocation interface first and uses the
engineer's documented read-only interface.

For `non_ui` issues, do not discover or invoke the Components Engineer. Run the
existing Create Task Plan workflow unchanged.

## Structured finding and consumption

Require the Components Engineer response to be treated as one structured input
to Create Task Plan, with fields equivalent to:

- `status`: `available`, `unavailable`, or `not-applicable`;
- `evidence`: inspected Jira and Figma references, plus any unavailable source;
- `component_findings`: reusable components, variants, tokens, contracts, and
  implementation constraints where available;
- `risks_and_gaps`: component, accessibility, responsive, consistency, and
  migration concerns; and
- `questions`: unresolved UI decisions that need user clarification.

For an available UI finding, Create Task Plan must merge its evidence,
component findings, risks, gaps, and questions into the normal synthesis. The
combined result is mandatory input to both the displayed gap analysis and the
created Superpowers plan; it must not be silently discarded or reported only as
an optional appendix.

## Unavailable UI context

UI context is unavailable when the Components Engineer cannot be discovered or
run, a supplied Figma reference is inaccessible, Figma inspection is not
permitted, or the engineer reports that the relevant component/design context
cannot be obtained. In that case, continue the read-only planning workflow and
add an explicit final-plan risk named `UI-context gap`. The risk must identify
the unavailable source, its planning impact, and the follow-up needed to close
it. Do not substitute invented component details.

## Data flow

1. The user explicitly invokes Create Task Plan with a Jira reference.
2. Rovo retrieves Jira evidence; Create Task Plan classifies it as UI-related
   or non-UI.
3. A non-UI issue continues through existing parallel analysis, gap synthesis,
   clarification, and planning unchanged.
4. A UI-related issue sends Jira context and any Figma links to the RW CRM
   Components Engineer. Its structured findings join the existing worker
   summaries before synthesis.
5. Create Task Plan exposes UI findings, risks, and questions in its gap
   analysis, then includes them in the final plan. If context is unavailable,
   the final plan instead includes the explicit UI-context gap.

## Acceptance tests

Add contract coverage for these cases:

1. A Figma-linked Jira issue is classified UI-related and invokes the Components
   Engineer with Jira context and the detected Figma URL.
2. A UI-library component Jira issue invokes the Components Engineer even when
   no Figma link is present.
3. A non-UI Jira issue does not discover or invoke the Components Engineer and
   otherwise follows the existing planning workflow.
4. Available structured findings are mandatory inputs to the gap analysis and
   written plan.
5. Unavailable or inaccessible relevant UI context does not halt read-only
   planning and produces an explicit UI-context gap in the final plan.

## Out of scope

- Implementing this integration, changing plugin manifests, or updating the
  installed plugin cache.
- Editing the RW CRM Components Engineer or adding an MCP server.
- Creating or modifying Jira issues, Figma files, branches, commits, pull
  requests, or component-library artifacts during planning.
