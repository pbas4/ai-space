# RW CRM Workflow

Classify the task and show the proposed model assignments before invoking a subagent. Wait for user confirmation (accept all or override individual assignments); every escalation requires a new confirmation.

Route Figma-linked, explicitly invoked, and clearly UI-relevant work into the package. Skip clearly non-UI tasks unless the user explicitly invokes it. In standalone use: Planner → Plan Reviewer → plan approval → Engineer edit approval → UI Reviewer. In Create Task Plan plugin use: Planner → delegated plugin brainstorming review → approval handoff; do not run the package Plan Reviewer there.
