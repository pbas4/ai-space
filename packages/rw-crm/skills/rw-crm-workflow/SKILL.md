---
name: rw-crm-workflow
description: Orchestrate approved RW CRM UI planning, implementation, and post-implementation review.
---

# RW CRM Workflow

Classify the task and use Codex's native selection prompt to show these model-mode choices before invoking a subagent: Recommended, Light, Medium, High, or Individual agents. After a preset is selected, show its exact model/reasoning assignments and ask for confirmation before invoking any subagent. Pass the approved assignment to every worker as immutable execution context. If the host cannot honor an assignment, report the gap and stop before that worker. Individual agent overrides remain available; every escalation requires a new confirmation. Do not replace the native selection prompt with an unstructured free-text question.

Use the shared routing policy: `ui-related`, `possible-ui`, or `non-ui`, with recorded evidence. Figma-linked, explicitly invoked, and clearly UI-relevant component work is `ui-related`. Standalone use accepts `possible-ui`; Create Task Plan auto-invokes only `ui-related` and asks the user about `possible-ui`. In standalone use: Planner → Plan Reviewer → plan approval → Engineer edit approval → UI Reviewer. A plan approval receipt must bind the plan ID and SHA-256 plan hash; a code-edit receipt must bind both plus the SHA-256 edit-set hash. In Create Task Plan plugin use: Planner → delegated plugin brainstorming review → approval handoff; do not run the package Plan Reviewer there. All target-repository test verification must use direct Jest commands; never invoke Nx or an Nx-wrapped test command.
