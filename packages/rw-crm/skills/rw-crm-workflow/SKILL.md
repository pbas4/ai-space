---
name: rw-crm-workflow
description: Orchestrate approved RW CRM UI planning, implementation, and post-implementation review.
---

# RW CRM Workflow

Classify the task and use Codex's native selection prompt to show these model-mode choices before invoking a subagent: Recommended, Light, Medium, High, or Individual agents. After a preset is selected, show its exact model/reasoning assignments and ask for confirmation before invoking any subagent. Individual agent overrides remain available; every escalation requires a new confirmation. Do not replace the native selection prompt with an unstructured free-text question.

Route Figma-linked, explicitly invoked, and clearly UI-relevant work into the package. Skip clearly non-UI tasks unless the user explicitly invokes it. In standalone use: Planner → Plan Reviewer → plan approval → Engineer edit approval → UI Reviewer. In Create Task Plan plugin use: Planner → delegated plugin brainstorming review → approval handoff; do not run the package Plan Reviewer there. All target-repository test verification must use direct Jest commands; never invoke Nx or an Nx-wrapped test command.
