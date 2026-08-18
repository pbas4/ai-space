# Create Task Plan consumer contract

The existing Create Task Plan plugin may call this package with:

```json
{
  "task": "string",
  "figmaLinks": ["string"],
  "componentScope": ["string"],
  "repositoryScope": ["string"],
  "constraints": ["string"],
  "approvals": { "plan": null, "codeEdits": null }
}
```

The package returns structured context, proposed or approved plan, status, changed artifacts, verification, and a proposed learning entry. The plugin is a consumer only: it supplies task context and links, receives the report, and cannot bypass either approval gate. The user remains responsible for approving the plan and code edits. This package does not modify the plugin.
