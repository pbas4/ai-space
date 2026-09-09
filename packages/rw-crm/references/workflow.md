# RW CRM Components Engineer workflow

The engineer identifies scope, retrieves relevant context, consults the learning ledger, proposes a bounded plan, waits for explicit plan approval, presents the exact code-edit set, waits for explicit code-edit approval, implements only that scope, and verifies the result.

Figma is evidence. The existing UI library is authoritative when the two conflict; the conflict and decision are returned in `context.libraryDecisions`. Missing or ambiguous context stops the workflow before implementation.

The context snapshot is task-scoped provenance and records source IDs, digests, scope, decisions, gaps, and ambiguities rather than source bodies. A material refresh transitions the workflow to `awaiting-context-reapproval`; previous approvals cannot be reused until the new snapshot is approved. Source allowlists are enforced by the host adapter before retrieval. Dry-run audit reports are read-only and redacted.
