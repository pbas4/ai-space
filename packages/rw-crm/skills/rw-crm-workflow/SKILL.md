---
name: rw-crm-workflow
description: Orchestrate approved RW CRM UI planning, implementation, and post-implementation review.
---

# RW CRM Workflow

Classify the task and use Codex's native selection prompt to show these model-mode choices before invoking a subagent: Recommended, Light, Medium, High, or Individual agents. After a preset is selected, show its exact model/reasoning assignments and ask for confirmation before invoking any subagent. Pass the approved assignment to every worker as immutable execution context. If the host cannot honor an assignment, report the gap and stop before that worker. Individual agent overrides remain available; every escalation requires a new confirmation. Do not replace the native selection prompt with an unstructured free-text question.

Use the shared routing policy: `ui-related`, `possible-ui`, or `non-ui`, with recorded evidence. Figma-linked, explicitly invoked, and clearly UI-relevant component work is `ui-related`. Standalone use accepts `possible-ui`; Create Task Plan auto-invokes only `ui-related` and asks the user about `possible-ui`. In standalone use: Planner → Plan Reviewer → plan approval → Engineer edit approval → UI Reviewer. A plan approval receipt must bind the plan ID and SHA-256 plan hash; a code-edit receipt must bind both plus the SHA-256 edit-set hash. In Create Task Plan plugin use: Planner → delegated plugin brainstorming review → approval handoff; do not run the package Plan Reviewer there. All target-repository test verification must use direct Jest commands; never invoke Nx or an Nx-wrapped test command. Follow [references/testing-policy.md](../../references/testing-policy.md) for behavior-based test and coverage scope.

Treat each context snapshot as task-scoped provenance. If a material refresh changes selected sources, scope, library decisions, gaps, or ambiguities, require `awaiting-context-reapproval` before continuing. Host adapters enforce source allowlists before retrieval. Dry-run reports are read-only and redacted; never include source bodies or credentials.

Expose the Planner's `planArtifact` as the current conversation Markdown artifact. Use `ticketKey` when available and `artifactRevision` 1 for the initial plan; increment the revision only when plan content materially changes, and keep previous revisions available in the conversation. The structured plan remains the approval source of truth. Approval prompts name the readable artifact and revision while the host binds its SHA-256 plan hash internally. Never use a SHA-256 value as the artifact title, filename, or content, and never write the planning artifact into the target repository.

If the host cannot attach the artifact, state that the attachment is unavailable and render the Markdown inline under the intended filename. Continue to use the structured plan for approval; never instantiate a hash-named fallback artifact.

If the user explicitly asks the workflow to prepare or create a commit, read and follow [the AI commit-labeling policy](../../references/ai-code-labeling.md). The implementation approvals do not authorize a commit.
