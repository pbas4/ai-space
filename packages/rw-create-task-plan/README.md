# RW Create Task Plan

The Realworks-oriented Create Task Plan plugin analyzes Jira work, routes UI-related tasks through the reusable RW CRM agents, and creates reviewed implementation plans after approval.

The package directory is prefixed with `rw-` for monorepo clarity. The plugin identifier remains `create-task-plan` so existing installations and invocations continue to work:

```text
create-task-plan@personal
```

## Validation

```bash
python3 -m unittest discover -s tests -v
python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```
