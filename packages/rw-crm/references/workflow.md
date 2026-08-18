# RW CRM Components Engineer workflow

The engineer identifies scope, retrieves relevant context, consults the learning ledger, proposes a bounded plan, waits for explicit plan approval, presents the exact code-edit set, waits for explicit code-edit approval, implements only that scope, and verifies the result.

Figma is evidence. The existing UI library is authoritative when the two conflict; the conflict and decision are returned in `context.libraryDecisions`. Missing or ambiguous context stops the workflow before implementation.
