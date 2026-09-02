# Repository Graph

Offline repository intelligence for coding agents. It indexes a local
TypeScript repository into `.repo-graph/index.sqlite` and exposes bounded,
source-backed navigation for agent workflows.

## Agent use

Install the plugin in Codex or copy `skills/repo-graph/SKILL.md` into an agent's
repository-scoped skills directory. The agent should check graph freshness,
query the graph for structure, and then read the referenced source before
answering or editing.

## Local tool

From this package directory:

```text
npm install
npm test
npm run build
node dist/src/cli/main.js index /absolute/path/to/repository
```

The tool is filesystem-local and offline. It does not invoke Git, a package
manager, child processes, or code from the indexed repository. See the command
help for `update`, `query`, `explain`, `path`, `impact`, `status`, `doctor`, and
`stats`.

## Validation

```text
npm test
npm run check:offline
npm run pack:offline
```

The exact runtime and build-only dependencies, versions, and licenses are
listed in `DEPENDENCIES.md`.
