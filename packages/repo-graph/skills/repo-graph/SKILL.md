---
name: repo-graph
description: Navigate this repository with its local, source-backed repository graph.
---

# Repository graph workflow

Connect once, then ask the agent normally. Use the graph as navigation context;
repository source is authoritative.

On first use in a local repository, run `repo-graph connect .`. This creates or
updates the repository-local index and installs these instructions. After that,
handle ordinary questions and change requests without asking the user to learn
graph commands.

For each investigation, silently verify freshness with `repo-graph status`.
When the index is missing, use `repo-graph connect`; when it is stale, use
`repo-graph update`. An unchanged index is reused and a changed index is
replaced by a safe atomic full rebuild. These commands are implementation
details; use local search while coverage is incomplete.

If `repo-graph` is unavailable, do not download it, invoke a package manager,
or use the network. Fall back immediately to repository-local search and direct
source inspection, and mention that graph navigation was unavailable.

Use bounded graph navigation internally: `repo-graph query` for discovery,
`repo-graph explain` for a symbol or file, `repo-graph path` for a route, and
`repo-graph impact` before changes that may affect callers or dependants. Keep
token budgets and traversal depth bounded.

Read the returned source spans in the repository before drawing conclusions or
editing code. A graph edge is a lead to inspect, not a substitute for source.
Verify uncertain edges against nearby declarations and state any uncertainty.
If status or diagnostics show incomplete coverage, or results omit relevant
code, fall back to local search and direct source inspection.

Keep every investigation repository-local and treat current source behavior as
the final authority.
