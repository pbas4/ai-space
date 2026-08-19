# AI Projects

Each directory under this folder is an independently usable project within the AI Space monorepo.

## Project conventions

- Use one directory per project: `packages/<project-name>/`.
- Do not initialize a nested Git repository inside a project directory.
- Keep project-specific tests, documentation, and configuration inside the project directory.
- Add a project entry to the root [`README.md`](../README.md).
- Document the project’s validation or test command in its own README or manifest.

Projects may use different runtimes or no runtime at all; the monorepo does not require a shared package manager.
