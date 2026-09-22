# Create Task Plan consumer contract

The existing Create Task Plan plugin is a thin consumer. It applies the shared `ui-related` / `possible-ui` / `non-ui` policy with its conservative `ui-related` auto-invocation threshold; `possible-ui` work requires a user confirmation. Explicit invocation is `ui-related`. It may call this package with:

```json
{
  "task": "string",
  "ticketKey": "PROJECT-123",
  "artifactRevision": 1,
  "figmaLinks": ["string"],
  "componentScope": ["string"],
  "repositoryScope": ["string"],
  "constraints": ["string"],
  "environment": "create-task-plan-plugin",
  "approvals": { "plan": null, "codeEdits": null }
}
```

The package returns structured context, an initial structured plan, and a `planArtifact` conversation Markdown artifact. The structured plan is the approval source of truth. The plugin carries routing evidence, the context snapshot ID, context gaps, and structured validation evidence into its planning/review records. It retains the initial plan artifact, performs its own brainstorming planning review, and publishes its synthesized final plan as a new conversation Markdown artifact with the next `artifactRevision`; previous revisions remain available. It obtains the user's final approval before handing the approved plan back to the Engineer.

The plugin passes the exact Jira key as `ticketKey`. Plan approval carries a plan ID and SHA-256 plan hash; code-edit approval carries the same plan hash and the SHA-256 edit-set hash. Hashes remain internal metadata and never become an artifact title, filename, or content. In plugin mode it does not invoke the package Plan Reviewer, preventing duplicate review. If an attachment is unavailable, the plugin reports that gap and renders the Markdown inline under its intended filename rather than creating a hash-named fallback.

After implementation and UI review, the package may return a concise PR description draft from its read-only PR Description Writer; it does not create the PR. The plugin supplies task context and links, receives the report, and cannot bypass either approval gate. The user remains responsible for approving the plan and code edits. Conversation artifacts do not modify the target repository. This package does not modify the plugin.
