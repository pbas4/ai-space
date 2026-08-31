# RW Create Task Plan

Realworks-oriented Jira task planning plugin for Codex. It turns a Jira issue into a reviewed, implementation-ready plan while preserving read-only analysis and explicit approval gates.

The package directory uses the `rw-` prefix for monorepo clarity. The technical plugin identifier remains `create-task-plan`, so existing installations continue to work:

```bash
codex plugin add create-task-plan@personal
```

In Claude Code, add the AI Space marketplace and install the same package independently:

```text
/plugin marketplace add pbas4/ai-space
/plugin install create-task-plan@ai-space
```

For UI-related tasks, install the RW CRM companion as well. The Create Task Plan
plugin delegates to its namespaced planner skill at runtime; installing only
Create Task Plan leaves that handoff unavailable:

```text
/plugin install rw-crm@ai-space
```

In Codex, install both plugins from the same marketplace before running a UI
plan:

```bash
codex plugin add rw-crm@ai-space
codex plugin add create-task-plan@ai-space
```

## What it does

1. Resolves and reads a Jira issue through the configured Atlassian Rovo connection.
2. Classifies the issue as `ui-related`, `possible-ui`, or `non-ui` using evidence from the Jira task.
3. For UI-related tasks, invokes the installed `rw-crm:rw-crm-components-planner` skill as a read-only subagent with the Jira scope, links, Figma references, and repository context.
4. Runs requirements, repository-impact, and technical-risk analysis.
5. Presents gaps, assumptions, risks, and the reviewed implementation plan for user approval.
6. Executes approved work only on an approved non-protected task branch, with checkpoint commit authorization.

## UI routing

The RW CRM package is automatically invoked only for `ui-related` work: a Figma/design reference, component scope, or explicit CRM UI-library or reusable component work. Generic frontend or visual language is `possible-ui`; the plugin asks before invoking RW CRM. `non-ui` issues continue through the separate planning workflow.

The planner is read-only. Create Task Plan does not invoke the Components Engineer or other implementation agents while creating the initial plan. Figma is also read-only and is inspected only after explicit user consent.

## Safety and approvals

- Existing Jira issues are never edited, commented on, or transitioned.
- New Jira subtasks require explicit approval of the complete creation batch.
- The implementation plan must be explicitly approved before implementation.
- Branch names require approval and must follow the issue taxonomy.
- `main` and `master` are protected from task changes and commits.
- Commits require checkpoint approval; pushing and pull-request creation require separate approval.
- Missing UI context is surfaced as an explicit planning risk; the plugin does not invent component details.

## Package relationship

This plugin is a thin consumer of the independently reusable RW CRM package:

```text
rw-create-task-plan
└── consumes installed rw-crm:rw-crm-components-planner for UI planning
```

The RW CRM package can be invoked directly for standalone planning, implementation, review, and PR-description workflows.

## Validation

From this package directory:

```bash
python3 -m unittest discover -s tests -v
python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```
