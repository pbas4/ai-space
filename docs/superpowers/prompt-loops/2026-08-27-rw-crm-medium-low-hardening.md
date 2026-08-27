# RW CRM Medium/Low Hardening Prompt Loop

**Status:** prepared; not scheduled or active until the implementation plan is approved and the user explicitly asks to activate it.

## State

Store state in the running task response, using this exact object shape:

```json
{
  "planPath": "docs/superpowers/plans/2026-08-27-rw-crm-medium-low-hardening.md",
  "completedTasks": [],
  "lastTask": null,
  "lastCommit": null,
  "verification": [],
  "blocker": null,
  "waitingFor": "plan-approval",
  "updatedAt": null
}
```

## Transition rules

| Condition | Action | Next run |
| --- | --- | --- |
| Plan or code edits lack explicit approval | Report `waitingFor`; make no edit. | None. |
| Unrelated working-tree changes exist | Report `blocker`; make no edit. | None. |
| Source is missing, ambiguous, disallowed, or materially changed | Report source/context evidence; invalidate affected approval. | None. |
| A task test fails | Report exact command/output summary; make no follow-on edit. | None. |
| Task passes exact verification | Record one completed task and evidence. | Only after user asks to continue or the activated heartbeat runs again. |
| All tasks complete | Report final verification matrix. | None. |

## Heartbeat prompt

```text
You are the bounded RW CRM medium/low hardening controller. Read docs/superpowers/plans/2026-08-27-rw-crm-medium-low-hardening.md and docs/superpowers/prompt-loops/2026-08-27-rw-crm-medium-low-hardening.md. Work on at most one unchecked task. Before any edit, inspect git status, read the task-specific tests, evaluate the controller conditions, and show the selected model/effort plus exact edit scope. Do not edit until the written plan and code edits have explicit user approval. Stop and report, without scheduling further execution, for unrelated changes, missing/disallowed context, material context change, failed tests, missing approval, or any commit/push/merge/publish/install action. When a task passes its exact checks, update only the loop state and report task, evidence, blocker or next task. Never run Nx.
```

## Manual invocation

```text
Run one eligible task from docs/superpowers/plans/2026-08-27-rw-crm-medium-low-hardening.md using docs/superpowers/prompt-loops/2026-08-27-rw-crm-medium-low-hardening.md. Do not proceed beyond that task or bypass an approval/stop condition.
```
