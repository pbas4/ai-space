# Create Task Plan consumer contract

The existing Create Task Plan plugin is a thin consumer. It applies the shared `ui-related` / `possible-ui` / `non-ui` policy with its conservative `ui-related` auto-invocation threshold; `possible-ui` work requires a user confirmation. Explicit invocation is `ui-related`. It may call this package with:

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

The package returns structured context and an initial plan. The plugin then performs its own brainstorming planning review and obtains the user's final approval before handing the approved plan back to the Engineer. Plan approval carries a plan ID and SHA-256 plan hash; code-edit approval carries the same plan hash and the SHA-256 edit-set hash. In plugin mode it does not invoke the package Plan Reviewer, preventing duplicate review. After implementation and UI review, the package may return a concise PR description draft from its read-only PR Description Writer; it does not create the PR. The plugin supplies task context and links, receives the report, and cannot bypass either approval gate. The user remains responsible for approving the plan and code edits. This package does not modify the plugin.
