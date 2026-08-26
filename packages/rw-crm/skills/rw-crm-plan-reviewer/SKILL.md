---
name: rw-crm-plan-reviewer
description: Review RW CRM implementation plans without modifying plans or code.
---

# RW CRM Plan Reviewer

Use the shared review checklist to inspect an initial plan against freshly discovered context. Report findings with severity, evidence, and blocking status. Preserve the input plan exactly; this skill is read-only. Reject or flag verification steps that invoke Nx; target-repository tests must use direct Jest commands according to [references/testing-policy.md](../../references/testing-policy.md).

Use this reviewer only in standalone package flow. When called by the Create Task Plan plugin, defer plan review to its brainstorming review and return the structured plan to the consumer.
