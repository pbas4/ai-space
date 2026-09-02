---
name: repo-graph
description: Navigate this repository with its local, source-backed repository graph.
---

# Repository graph workflow

Use the graph as navigation context. Repository source is authoritative.

1. Run `repo-graph status` before relying on graph results. If the index is
   missing, build it with `repo-graph index`. If it is stale, refresh it with
   `repo-graph update`; an unchanged index is reused and a changed index is
   replaced by a safe atomic full rebuild. Use local search until it is current.
2. Start broad discovery with `repo-graph query <selector> --budget <tokens>`.
   Keep the budget bounded and increase it only when the result is too narrow.
3. Use `repo-graph explain <selector> --budget <tokens>` to inspect a symbol or
   file, `repo-graph path <from> <to> --budget <tokens>` to investigate a route,
   and `repo-graph impact <selector> --depth <hops> --budget <tokens>` before a
   change that may affect callers or dependants.
4. Read the returned source spans in the repository before drawing conclusions
   or editing code. A graph edge is a lead to inspect, not a substitute for the
   source.
5. Verify uncertain edges against their source spans and nearby declarations.
   State any uncertainty that remains.
6. When status or diagnostics show incomplete coverage, or graph results omit
   relevant code, fall back to local search and direct source inspection.

Keep every investigation repository-local and treat current source behavior as
the final authority.
