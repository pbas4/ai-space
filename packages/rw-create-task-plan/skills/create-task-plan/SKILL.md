---
name: create-task-plan
description: Analyze a Jira task from Atlassian Rovo, route UI-related work through the read-only RW CRM Components Planner, identify risks and gaps, and create a reviewed implementation plan after approval.
---

# Create Task Plan

Use this skill only when the user supplies a Jira URL, an issue key such as `PROJECT-123`, or a resolvable numeric issue identifier and asks to analyze, plan, or implement that task.

## Boundaries

- Jira is read-only except for creation of an explicitly approved batch of new subtasks. Never comment on, transition, edit, or otherwise modify an existing Jira issue.
- Figma is read-only. Never modify a Figma file.
- Prefer the Codex structured-choice prompt for every material question or approval when the runtime exposes it. If it is unavailable, ask one concise plain-text question at a time.
- Only the coordinator speaks with the user. Workers return concise, evidence-based summaries and never ask the user questions.
- Do not begin implementation until the user approves the written implementation plan.
- Never push directly to `main` or `master`.
- The only permitted write to `main` is the initial `git pull --ff-only` fast-forward update while local `main` and the worktree are clean. Never make task changes, commit, merge, rebase, reset, use force operations, or perform any other write on `main` or `master`.
- Use configured Atlassian Rovo MCP tools to resolve and read the task. Do not invent tool names; discover available tools first.
- When verifying tests in a target repository, inspect its Jest configuration and run the narrowest relevant Jest command directly. Never invoke Nx directly or through an Nx-wrapped package script (`nx test`, `nx run`, `npx nx`); if Jest context is unavailable, report the verification gap instead of guessing a replacement.
- Use Figma MCP only after the user explicitly agrees to inspect a detected Figma reference.
- In clarification loops, ask exactly one question at a time, using a structured-choice prompt when appropriate and available; use a concise text question only when structured choices are unavailable. At any time, accept `proceed with assumptions`, list every assumption and risk, and continue.

## Input and preflight

1. Normalize the input as a Jira URL, issue key, or numeric identifier. For a numeric identifier that cannot be resolved unambiguously, ask for its Jira project/key.
2. Confirm that a configured Atlassian Rovo MCP connection and a read-only issue retrieval tool are available. If not, stop and explain that Atlassian Rovo must be configured before this skill can run.
3. Retrieve the issue and preserve links, attachments, description, acceptance criteria, comments available through the read-only tool, and related issues as evidence.
4. Classify the retrieved Jira issue before repository analysis or planning using the shared RW CRM routing policy. Return `ui-related` when evidence contains a Figma URL or design reference, non-empty component scope, or explicitly identifies a CRM UI-library component, component-library change, or reusable-component work. Return `possible-ui` for generic screens, frontend, or UI language without definite component evidence. Return `non-ui` otherwise. Record the classification evidence and confidence. The coordinator must auto-invoke the RW CRM Components Planner only for `ui-related`. For `possible-ui`, ask one structured-choice confirmation before invoking the Planner; the choices are invoke RW CRM planning, continue as non-UI, or cancel planning.
5. Confirm the current repository context before starting repository analysis. Never inspect or modify a repository outside the user's current task scope.

## RW UI Components Planner consultation

For every `ui-related` issue, and every `possible-ui` issue for which the user selected RW CRM planning, discover the installed `rw-crm:rw-crm-components-planner` before gap synthesis and invoke it once through its documented read-only interface when available. Provide Jira key, URL, issue type, title, description, acceptance criteria, labels, attachments, links, related issues, UI-classification evidence, and every detected Figma URL or design reference. Do not invoke the RW CRM Components Engineer or any implementation agent during planning.

Require the planner's read-only initial implementation plan with equivalent `status`, `evidence`, `scope`, `files`, `interfaces`, `risks_and_gaps`, `verification`, and `questions` fields. `status` is `available` when the planner returned relevant context, `unavailable` when discovery, invocation, Figma access, or component context failed, and `not-applicable` only for `non-ui` work.

Carry the shared routing evidence, context snapshot ID, context gaps, and any structured validation evidence into the plugin's planning and review records so standalone and plugin behavior remain auditable.

For a non-UI issue, do not invoke the RW UI Components Planner. Continue with the separate non-UI planning workflow unchanged.

When UI context is unavailable, continue the read-only planning workflow. Add an explicit `UI-context gap` risk to the final plan that names the unavailable source, its planning impact, and the follow-up needed to close it. Do not invent component details.

## Git preparation

Establish a clean `main` before proposing any task branch.

1. Inspect the current repository. Continue only when the worktree is clean and the current branch is `main`; otherwise stop and ask the user to resolve it.
2. Run `git pull --ff-only`. On a dirty worktree, missing `main`, missing upstream, authentication failure, divergence, or any Git failure, stop and ask the user to resolve it. Never stash, reset, force-pull, or rebase automatically.
3. Classify the retrieved Jira item before proposing a branch. Treat every original Jira issue as a parent issue, including an issue whose Jira type is `Task`. Propose `feature/<JIRA-KEY>-<normalized-title>` for every parent issue. Propose `fix/<JIRA-KEY>-<normalized-title>` only for a Jira Bug or Defect. Reserve `task/<JIRA-KEY>-<normalized-title>` exclusively for a Jira subtask that this plugin created after the user explicitly approved the complete Jira-subtask creation batch. Do not use `task/` for an original Jira issue or for a pre-existing Jira subtask that this plugin did not create in the current approved batch. Preserve Jira-key casing and normalize the title by lowercasing it and replacing non-alphanumeric runs with one hyphen.
4. Obtain approval before any `git switch`, `git checkout`, branch creation, or other branch-changing Git command. Show the exact proposed branch name and the reason for its prefix. Use a structured choice when available: `Approve this branch name`, `Edit the branch name`, or `Do not create or check out a branch`. Use one concise text question only when structured choices are unavailable. Do not run a branch-changing Git command before approval.
5. When the user edits a branch name, validate it as a Git branch name. An edited branch name must retain the approved prefix for the item's classification; if it does not, reject the edit and ask for another name or cancellation. Never propose, use, or check out `main` or `master` as a task branch. The flow must show the final exact name for a second explicit approval before changing branches. If the user declines, planning and read-only analysis may continue, but the plugin must block implementation and commits until a branch is explicitly approved. Do not silently choose a fallback branch.
6. After approval, check whether the exact branch already exists. If it does, ask again before checkout, offering to use the existing branch, edit the name, or cancel. Do not offer an existing protected branch as a conflict-resolution choice. Never overwrite, delete, reset, rebase, or otherwise alter a conflicting branch automatically.
7. Before every commit, verify the active branch is neither `main` nor `master`; otherwise stop without staging changes.

## Parallel analysis

When subagents and per-agent model routing are available, start these independent read-only workers in parallel and wait for all summaries:

| Worker | Scope | Model and reasoning |
| --- | --- | --- |
| Requirements analyst | Jira scope, acceptance criteria, gaps, contradictions, dependencies, ownership | `gpt-5.6-sol`; medium for bounded work, high for ambiguous, cross-system, or high-risk work |
| Repository-impact analyst | Relevant modules, established patterns, tests, migrations, integrations, side effects | `gpt-5.6-luna`; high for bounded exploration, extra-high for broad, unfamiliar, or highly coupled paths |
| Technical-risk analyst | Failure modes, operational, security, performance, delivery, and rollback risks | `gpt-5.6-sol`; medium for bounded work, high for ambiguous, cross-system, or high-risk work |

Give each worker only its assigned scope and require a short report containing evidence, findings, confidence, and unanswered questions. If subagents or a requested model override are unavailable, complete the same checks sequentially using the closest configured model and disclose a fallback only when it materially changes depth, speed, or cost.

For `ui-related` work, merge the RW UI Components Planner's structured finding with these worker summaries before synthesis. An available finding is mandatory input to both the displayed gap analysis and the created implementation plan; do not relegate it to an appendix or silently discard it.

## Figma discovery

1. Inspect the Jira evidence for Figma URLs or design references and pass every detected reference to the RW UI Components Planner consultation for `ui-related` work.
2. If none exist, continue without Figma; a UI-library component issue still uses the RW UI Components Planner consultation.
3. If one exists, disclose the exact reference and ask whether the RW UI Components Planner may inspect it through the configured read-only Figma interface before planning.
4. On no or inaccessible Figma, retain the reference as evidence and require the planner finding to report unavailable UI context. On yes, follow the planner's documented interface and any installed Figma prerequisite before design-context access. It must not edit the design.

## Synthesis and clarification

1. Merge worker summaries, the RW UI Components Planner finding when applicable, and Jira and repository evidence. Deduplicate findings and separate facts from inferences.
2. Present a concise task summary followed by material gaps, inconsistencies, difficulties, likely side effects, dependencies, unresolved risks, and any UI-context gap.
3. Ask the single most important unresolved question. Repeat until material uncertainty is resolved or the user says `proceed with assumptions`.
4. Before planning, state the final assumptions, non-goals, and risks that remain. Include the available RW UI Components Planner plan in the implementation plan, or the explicit UI-context gap when relevant context was unavailable.

## Large-task decomposition

1. When the issue has multiple independent deliverables, cross-team work, or dependencies that make one implementation plan unsafe, propose a dependency-ordered subtask backlog.
2. For every proposed subtask, provide title, description, acceptance criteria, dependencies, parent linkage, risk notes, and a concise implementation plan.
3. Detect probable duplicate subtasks from the retrieved Jira evidence. Present the full creation preview and ask whether to create the batch, revise it, or continue without creating Jira subtasks.
4. Create new Jira subtasks only after the user explicitly approves the full subtask batch and only after discovering a configured Rovo create-subtask capability. Do not comment, transition, edit, or otherwise modify existing Jira issues.
5. After creation, process plugin-created subtasks sequentially in dependency order. The original Jira issue retains its separately approved `feature/` or `fix/` branch. For each plugin-created Jira subtask, return to clean updated `main`, derive its eligible `task/` branch, show and obtain its separate branch-name approval using the Git-preparation gate, then present and obtain approval for its plan, implement it, verify it, and report its checkpoint before continuing. Do not assign a `task/` branch to a Jira subtask that the plugin did not create in the current approved batch.
6. Before starting a dependent subtask, verify that every predecessor commit required by its plan is an ancestor of clean, updated `main`. If any required predecessor commit is not an ancestor, stop and tell the user that external integration is required. Never merge, rebase, cherry-pick, or otherwise integrate predecessor work yourself.

## Planning handoff

1. For `ui-related` work, use the RW UI Components Planner's read-only initial implementation plan as the planning baseline. Do not invoke Superpowers brainstorming or the RW CRM Components Engineer.
2. For `non-ui` work, continue the separate non-UI planning workflow and use the installed `superpowers:writing-plans` skill only after synthesis and clarification. Do not invoke Superpowers brainstorming.
3. Present the resulting plan and wait for explicit approval before implementation.
4. After approval, follow the existing execution and verification gates. Route complex or high-risk non-UI implementation/review work to `gpt-5.6-sol` at medium or high reasoning by difficulty; route remaining independent test or exploration work to `gpt-5.6-luna` at high or extra-high reasoning by difficulty.
5. Preserve protected-branch, test-driven development, verification, commit-authorization, Jira, and Figma read-only boundaries. Do not write Jira outside the explicitly approved subtask batch or write Figma at any point.

At each verified implementation checkpoint, preview the exact commit message including the Jira key and prefer a structured choice with: `Commit this checkpoint`, `Allow commits for the rest of this parent-task run`, and `Do not commit now`. Wait for the user's selection. The second choice is valid only for the current parent-task run. Commit only after the user selects `Commit this checkpoint` or while `Allow commits for the rest of this parent-task run` authorization is active. Otherwise, do not commit. Commit only tested changes on the active non-protected task branch, then report the commit hash, tests, remaining dependencies, assumptions, risks, and rollback considerations.

Commit authorization never authorizes a push or pull-request creation. Before any push or pull-request creation, wait for separate, explicit user approval for that exact action.

## Failure handling

- Atlassian Rovo unavailable, unauthenticated, or unable to resolve the task: stop before analysis and explain the configuration or identifier problem.
- Figma unavailable or unreadable: report the limitation and continue with Jira and repository evidence unless the user says the design is required.
- Jira and repository evidence conflict: identify the conflict and ask one focused clarification question before planning.
- Worker failure: retain successful summaries and run the failed scope sequentially when possible.
