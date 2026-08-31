# AI Projects

Each directory under this folder is an independently usable project within the AI Space monorepo.

Both projects are independently installable from the AI Space marketplaces:

- Claude Code: `rw-crm@ai-space` and `create-task-plan@ai-space`
- Codex: `rw-crm@ai-space` and `create-task-plan@ai-space`

## Project conventions

- Use one directory per project: `packages/<project-name>/`.
- Do not initialize a nested Git repository inside a project directory.
- Keep project-specific tests, documentation, and configuration inside the project directory.
- Add a project entry to the root [`README.md`](../README.md).
- Document the project’s validation or test command in its own README or manifest.

Projects may use different runtimes or no runtime at all; the monorepo does not require a shared package manager.
## Packages

- [`rw-crm/`](rw-crm/) — reusable RW CRM planning, implementation, and UI-review agents.
- [`rw-create-task-plan/`](rw-create-task-plan/) — Jira task planning plugin that consumes RW CRM UI planning agents.

Each package is independently installable and owns its source, tests, documentation, and runtime configuration.
