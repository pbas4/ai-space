# RW CRM Package Agents — Design Specification

## Purpose

Evolve the current standalone `rw-crm-components-engineer` package into a reusable `packages/rw-crm/` package containing coordinated but independently callable RW CRM UI subagents and shared skills. The package should support the full UI workflow while keeping planning, implementation, and review responsibilities separate.

The package is focused on RW CRM UI work. It is independently usable outside the existing Create Task Plan plugin, while the plugin can invoke it as a thin task-planning and orchestration consumer.

## Package composition

The package contains four independent subagents and one optional orchestrator:

### RW CRM Components Planner

Read-only and responsible for creating an **initial plan** from task context. It discovers relevant Figma, UI-library, CRM-code, tests, accessibility, and RW-convention context; identifies scope, risks, ambiguities, and Figma/library conflicts; and returns a structured initial plan. It does not implement code and does not claim the plan is approved or implementation-ready.

### RW CRM Plan Reviewer

Read-only and responsible for reviewing an initial plan outside the Create Task Plan plugin. It checks scope, context completeness, component boundaries, UI-library authority, risks, approval requirements, verification coverage, and implementation readiness. It returns review findings and a reviewed-plan recommendation but does not edit the plan or code.

The Plan Reviewer follows the same review principles as the plugin’s brainstorming planning review, encoded as a repeatable RW CRM checklist. The package must not run both reviews sequentially by default:

- inside the Create Task Plan plugin, use the plugin’s brainstorming planning review;
- outside the plugin, use the RW CRM Plan Reviewer.

### RW CRM Components Engineer

Refactor the existing engineer so planning is no longer its primary responsibility. It accepts a reviewed and approved plan, validates that the plan is complete and consistent with current context, presents the concrete code-edit set, and waits for explicit code-edit approval before implementing. It owns component creation, bug fixes, feature extensions, implementation, and verification.

It may pause when a plan is stale, incomplete, unsafe, or inconsistent with the UI library, but it does not silently redesign the task. Any scope change requires a new plan approval.

### RW CRM UI Reviewer

Read-only and responsible for reviewing the implemented result after every Components Engineer task, including non-visual code changes. It reviews code, rendered UI where available, behavior, accessibility, Figma alignment, UI-library alignment, and RW conventions.

Critical findings block completion. Lower-severity findings are reported for follow-up. The reviewer never applies fixes.

### RW CRM Workflow Orchestrator

An optional default entry point for tasks entering through the RW CRM package. It coordinates the subagents but does not replace their independent profiles. It enforces the two implementation approvals and selects the appropriate planning review based on environment.

The orchestrator is not required when a caller wants to invoke a specific subagent directly.

## Flows

### Standalone package flow

```text
task intake → Planner → Plan Reviewer → user approves reviewed plan
→ Engineer validates plan → user approves code edits → Engineer implements/verifies
→ UI Reviewer → final status
```

The standalone Planner returns an initial plan only. The Plan Reviewer produces the package’s repeatable review before the user approves the plan.

### Create Task Plan plugin flow

```text
UI task routing → Planner → plugin brainstorming planning review
→ user approves reviewed plan → Engineer validates plan
→ user approves code edits → Engineer implements/verifies
→ UI Reviewer → final status
```

The existing Create Task Plan plugin remains a thin coordinator and consumer. It supplies task context and links, invokes the package only for UI-relevant tasks or explicit user invocation, receives the Planner’s structured initial plan, performs its own brainstorming planning review, and presents the final plan for approval. It does not duplicate RW-specific context or implementation logic, and it is not modified as part of this package refactor except for explicitly documented consumer-contract guidance.

### Routing rules

The plugin automatically invokes the package when a task includes a Figma link or clear UI/frontend/component language, including styling, accessibility, visual review, UI-library, or CRM-component references. A clearly non-UI task is not routed to the package automatically. Explicit user invocation always overrides the automatic relevance check.

## Shared knowledge and skills

All subagents use the same shared context capabilities:

- indexed/on-demand Figma design-system sources;
- indexed/on-demand UI-library sources;
- indexed/on-demand CRM component code, stories, routes, and tests;
- the full Confluence subtree rooted at page `21790813`, including every current and future direct child and nested descendant;
- RW Front-End Chapter conventions, refreshed on demand;
- learning-ledger entries, separated into stable rules and task-specific exceptions;
- UI-library-over-Figma conflict decisions;
- structured context, plan, approval, verification, and review schemas.

Shared context is a package dependency, not an agent-to-agent call. Each subagent remains independently callable with the same context contract.

The package should expose reusable skills/modules for context discovery, plan generation, plan review, implementation approval, UI review, model routing, learning-ledger proposals, and verification. Focused Figma, code-search, testing, visual, and accessibility helpers may provide evidence, but the owning subagent remains responsible for its decisions.

## Model routing and user confirmation

Model selection is dynamic and configurable rather than hard-coded as a permanent choice. Before any subagent is invoked, the orchestrator presents a model execution proposal containing:

- task complexity classification and reasons;
- planned subagents and execution order;
- selected model and reasoning level for each subagent;
- the option to accept all, override individual assignments, or cancel.

Every model escalation requires a new explicit confirmation. The system must not silently upgrade a model or consume a higher-cost tier.

Default model policy:

- **Planner:** `gpt-5.6-sol`, high reasoning;
- **Plan Reviewer:** `gpt-5.6-terra`, high reasoning;
- **Components Engineer:** `gpt-5.6-sol`, high or xhigh reasoning;
- **UI Reviewer:** `gpt-5.6-terra`, high reasoning;
- **Workflow Orchestrator:** `gpt-5.6-luna`, medium reasoning.

Dynamic routing uses three tiers:

- **Luna:** simple, localized, well-scoped work with no conflicts or complex state;
- **Terra:** standard component bugs, feature extensions, or multi-file work with known patterns;
- **Sol:** new components, cross-component behavior, state/data changes, multiple screens, accessibility risk, Figma/library conflicts, ambiguity, or failed verification.

The orchestrator may classify a task before invoking the Planner. Any subagent may request escalation when it encounters missing or ambiguous context, a conflict, scope expansion, failed verification, or correctness risk, but the orchestrator must obtain confirmation before using the higher tier.

Model recommendations are based on the current official OpenAI guidance that positions GPT-5.6 Sol for complex reasoning and coding, GPT-5.6 Terra for intelligence/cost balance, and GPT-5.6 Luna for cost-sensitive workloads: [OpenAI model guidance](https://developers.openai.com/api/docs/models).

## Approval and safety model

The workflow has two separate user approvals:

1. approval of the final plan—after either plugin brainstorming review or standalone Plan Reviewer review;
2. approval of the concrete code-edit set produced by the Components Engineer.

No code or configuration change may occur before both approvals. The approval record includes the plan identity, edit-set identity, approving user, and timestamps. A changed plan or edit set invalidates the previous approval.

All subagents are read-only by default except the Components Engineer after both approvals. The Planner, Plan Reviewer, and UI Reviewer never modify code or design artifacts. Missing, stale, inaccessible, or conflicting context is reported explicitly. The package never guesses or silently overrides the UI library.

When Figma conflicts with the existing UI library, the UI library is authoritative. The Planner, Plan Reviewer, Engineer, and UI Reviewer must surface the conflict, identify the affected decision, and record the library-based resolution.

## Learning ledger

Any of the four subagents may propose a learning entry after a user correction or reusable insight. Entries are classified as:

- stable rules, which apply broadly across the RW CRM package; or
- task-specific exceptions, which apply only to a named task, component, screen, or situation.

Proposals include the lesson, evidence, classification, scope, and suggested version change. Persistence requires explicit user approval. A correction must never be silently generalized into a stable rule.

## Collaboration contracts

Every subagent accepts the shared request shape:

```text
{
  task,
  figmaLinks,
  componentScope,
  repositoryScope,
  constraints,
  environment: "standalone" | "create-task-plan-plugin",
  approvals,
  modelApproval
}
```

The Planner returns an initial context report and initial plan. The Plan Reviewer returns review findings and a reviewed-plan recommendation. The Engineer returns implementation status, changed artifacts, verification evidence, and proposed learning. The UI Reviewer returns findings with severity, affected artifacts, evidence, and completion-blocking status. The Orchestrator returns the combined workflow state and preserves each subagent’s structured result.

## Validation expectations

The refactor must verify:

- independent invocation of Planner, Plan Reviewer, Components Engineer, and UI Reviewer;
- standalone flow using Plan Reviewer;
- plugin flow using plugin brainstorming review without duplicate package review;
- UI-only routing, explicit invocation override, and non-UI skip behavior;
- model execution proposal, accept-all, per-agent override, and confirmation-required escalation;
- missing and ambiguous context handling;
- Figma/UI-library conflict reporting with library authority;
- plan approval and code-edit approval gates;
- new component creation, existing-component bug fix, and feature extension;
- UI Reviewer execution after every Engineer task;
- critical findings blocking completion and non-critical findings remaining report-only;
- learning proposals from each subagent with user-approved persistence only; and
- no modifications to the existing Create Task Plan plugin beyond consumer documentation explicitly required by the integration contract.

## Scope boundary

This specification covers the RW CRM package redesign, new Planner and Plan Reviewer subagents, new UI Reviewer subagent, optional Workflow Orchestrator, dynamic model routing and confirmation, and refactoring the existing Components Engineer. It does not implement the package, modify the Create Task Plan plugin, or define the detailed implementation plan that follows a separate planning stage.
