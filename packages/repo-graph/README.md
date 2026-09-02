# Repository Graph

Offline repository intelligence for coding agents. It indexes a local
TypeScript repository into `.repo-graph/index.sqlite` and gives agents
bounded, source-backed navigation.

## Agent use

The plugin supplies agent instructions; its companion `repo-graph` executable
must be available on the agent's `PATH`. Install the self-contained offline
tarball once per machine, from outside every repository you intend to index:

```text
npm install --global --offline --ignore-scripts --no-audit --no-fund /absolute/path/to/repo-graph-0.1.0.tgz
repo-graph --version
```

The tarball bundles its runtime dependency, so this setup does not download
packages. Agents must never install it themselves: when the executable is not
available, they fall back to local search without network or package-manager
actions.

Connect a repository once:

```text
repo-graph connect /absolute/path/to/repository
```

Then ask your coding agent ordinary questions such as “Where is authentication
handled?” or “What breaks if I change this API?” The installed instructions
guide the agent to refresh the local graph, navigate it within bounded budgets,
and inspect source spans before conclusions or edits.

The tool is filesystem-local and offline. It does not invoke Git, a package
manager, child processes, or code from the indexed repository. Advanced
commands remain available for agents and diagnostics: `update`, `query`,
`explain`, `path`, `impact`, `status`, `doctor`, and `stats`.

## Validation

```text
npm test
npm run check:offline
npm run pack:offline
```

The exact runtime and build-only dependencies, versions, and licenses are
listed in `DEPENDENCIES.md`.
