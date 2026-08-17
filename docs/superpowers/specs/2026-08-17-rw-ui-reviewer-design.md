# RW UI Reviewer — Design Specification

## Purpose

Create a reusable, standalone agent package for reviewing RW CRM user interfaces against Figma designs and the existing RW UI component library. The package provides a dedicated **RW UI Reviewer** profile and a reusable review skill that can be applied across UI tasks.

## Operating principles

- **Review first:** The agent is read-only by default and produces findings before proposing implementation work.
- **Explicit approval for changes:** The agent must not modify code, Figma files, or project configuration unless the user explicitly approves a specific change.
- **Authoritative design system:** When Figma conflicts with the existing UI library, the UI library is authoritative. The agent must flag the conflict, identify the affected component or pattern, and record the resulting design-system decision rather than silently choosing one.
- **No guessing:** If Figma, source code, rendered UI, or component-library context is missing or inaccessible, the report must say exactly what is missing and how it limits the review. The agent must not infer details or make modifications to compensate.

## Invocation and context

The agent is intended to activate when:

1. A task contains a Figma link or otherwise explicitly references Figma.
2. The user explicitly invokes the RW UI Reviewer.
3. The task clearly involves UI implementation, visual refinement, component usage, or frontend behavior where a review is useful.

For each review, the agent gathers the available Figma references, affected screens and components, rendered application state, source code, and UI-library documentation or stories. It records unavailable inputs before assessing fidelity.

## Review output

Each report includes:

- prioritized mismatches, grouped by severity and confidence;
- affected screens, routes, components, and states;
- recommended fixes, stated as actionable review guidance rather than applied changes;
- explicit Figma-versus-design-system decisions, including any library/Figma conflicts and the authoritative basis for the recommendation;
- missing context, assumptions avoided, and review limitations.

The report should distinguish visual, interaction, responsive, accessibility, and component-contract findings where evidence supports those categories.

## Plugin integration

The existing Create Task Plan plugin supplies task context and links relevant to the review. The RW UI Reviewer consumes that context and returns its report to the plugin workflow only; it does not create or update an implementation plan. After reviewing the report, the user creates the implementation plan and separately approves any code changes.

## Verification approach

Before the package is considered ready, verify the workflow with representative samples:

- at least one Figma-linked UI task, confirming that links are discovered, mismatches are prioritized, and Figma/library conflicts are surfaced;
- at least one non-Figma UI task, confirming explicit invocation or clear UI-task detection and a useful review based only on available code and library context;
- a missing-context case, confirming that the agent reports the gap clearly and performs no guessing or modifications.

Verification should check both report contents and the read-only boundary.

## Scope boundary

This specification defines the agent profile, reusable review behavior, integration boundary, report contract, and verification expectations. It does not implement the package, connect tools, define a detailed implementation plan, or authorize code changes.
