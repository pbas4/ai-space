# AI Space

Monorepo for independent AI projects, agents, plugins, and reusable workflows.

## Projects

Projects live under [`packages/`](packages/). Each project owns its own source, tests, documentation, and runtime configuration.

- [`packages/rw-crm/`](packages/rw-crm/) — reusable RW CRM planning, implementation, and UI-review Codex plugin.
- [`packages/rw-create-task-plan/`](packages/rw-create-task-plan/) — Realworks-oriented Create Task Plan plugin with RW CRM UI planning integration.
- [`packages/book-summary/`](packages/book-summary/) — summarize EPUB/PDF books into a templated Markdown + PDF and file them to Google Drive and Obsidian.

## Working with a project

Clone the full repository when working across projects:

```bash
git clone git@github.com:pbas4/ai-space.git
cd ai-space
```

Then work inside the relevant project directory. Project-specific commands are documented in that project’s README or package manifest.

For a focused checkout containing only one project, use sparse checkout:

```bash
git clone --filter=blob:none --no-checkout git@github.com:pbas4/ai-space.git
cd ai-space
git sparse-checkout init --cone
git sparse-checkout set packages/rw-crm
git checkout main
```

## Branching convention

Use a branch named for the project and change:

```text
feat/<project>-<change>
fix/<project>-<change>
docs/<project>-<change>
```

Keep project changes scoped to that project’s folder unless the shared root documentation or tooling genuinely needs updating.
