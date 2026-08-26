# RW CRM model policy

Before orchestration, show a model execution proposal with the selected tier, assignments, reasons, and accept-all or per-agent override choices. Luna handles simple localized work, Terra handles standard component work, and Sol handles complex, ambiguous, design-conflict, accessibility-sensitive, or failed-verification work. Every escalation requires a new user confirmation.

The native selection prompt offers `Recommended`, `Light`, `Medium`, `High`, and `Individual agents`. `Recommended` preserves automatic task-based routing. `Light` assigns Luna/high to planning and Luna/medium to plan review, implementation, and UI review. `Medium` assigns Terra/high to planning, implementation, and UI review, with Luna/medium for plan review and orchestration. `High` assigns Sol/high to planning and review, and Sol/medium to implementation. The PR Description Writer remains fixed at Luna/light in every mode.

The PR Description Writer is the fixed exception: it always uses `gpt-5.6-luna` with light reasoning because its output is a concise communication draft, not implementation or analysis. Its assignment is not changed by task complexity or ordinary per-agent overrides.
