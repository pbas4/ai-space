# AI Projects

Each directory under this folder is an independently usable project within the AI Space monorepo.

All packages are independently installable from the AI Space marketplaces:

- Claude Code: `rw-crm@ai-space`, `create-task-plan@ai-space`, and `book-summary@ai-space`
- Codex: `rw-crm@ai-space`, `create-task-plan@ai-space`, and `book-summary@ai-space`

## Project conventions

- Use one directory per project: `packages/<project-name>/`.
- Do not initialize a nested Git repository inside a project directory.
- Keep project-specific tests, documentation, and configuration inside the project directory.
- Add a project entry to the root [`README.md`](../README.md).
- Document the project’s validation or test command in its own README or manifest.

Projects may use different runtimes or no runtime at all; the monorepo does not require a shared package manager.
## Packages

- [`rw-crm/`](rw-crm/) — reusable RW CRM planning, implementation, and UI-review agents.
- [`rw-create-task-plan/`](rw-create-task-plan/) — Jira task planning plugin that consumes the installed `rw-crm:rw-crm-components-planner` skill for UI planning; install both plugins for that handoff.
- [`book-summary/`](book-summary/) — skill that summarizes a book or document (EPUB/PDF/DOCX/HTML/TXT/URL) into a templated Markdown + PDF via model-split subagents, and files it to Google Drive and Obsidian.

Each package is independently installable and owns its source, tests, documentation, and runtime configuration.
