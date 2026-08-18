# Create Task Plan consumer contract

The existing Create Task Plan plugin is a thin consumer. It automatically invokes this package only for UI-relevant tasks (Figma-linked tasks, explicit invocation, or clear UI/frontend work); explicitly invoking the package overrides a non-UI skip. It may call this package with:

```json
{
  "task": "string",
  "figmaLinks": ["string"],
  "componentScope": ["string"],
  "repositoryScope": ["string"],
  "constraints": ["string"],
  "environment": "create-task-plan-plugin",
  "approvals": { "plan": null, "codeEdits": null }
}
```

The package returns structured context and an initial plan. The plugin then performs its own brainstorming planning review and obtains the user's final approval before handing the approved plan back to the Engineer. In plugin mode it does not invoke the package Plan Reviewer, preventing duplicate review. The plugin supplies task context and links, receives the report, and cannot bypass either approval gate. The user remains responsible for approving the plan and code edits. This package does not modify the plugin.
