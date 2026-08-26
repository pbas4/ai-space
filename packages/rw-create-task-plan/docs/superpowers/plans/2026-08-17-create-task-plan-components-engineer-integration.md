# Create Task Plan Components Engineer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Route UI-related Jira planning through the independently installed RW CRM Components Engineer without changing manual invocation, read-only boundaries, or non-UI workflow.

**Architecture:** Extend the declarative Create Task Plan skill with an early UI classifier and a discovery-based engineer consultation. The engineer finding joins existing analysis before synthesis; unavailable UI context becomes a visible plan risk rather than a planning blocker.

**Tech Stack:** Markdown skill instructions, Python unittest text contracts, Codex skill discovery, Rovo and Figma MCP interfaces.

## Global Constraints

- Retain explicit manual Create Task Plan invocation; do not enable implicit invocation.
- UI-related means a Figma/design reference or explicit CRM UI-library/component evidence in retrieved Jira data.
- Discover the Components Engineer interface at runtime; do not hardcode a path, skill name, or MCP tool.
- Provide Jira evidence and every Figma URL to the engineer; consume available structured findings in both gap analysis and plan.
- Non-UI tasks neither discover nor invoke the engineer and retain the existing workflow.
- Jira, Figma, repository analysis, and planning remain read-only except pre-existing approved Jira-subtask behavior.
- Do not modify the Components Engineer package.
- If relevant UI context is unavailable, continue planning and add an explicit UI-context gap with source, impact, and follow-up.

---

### Task 1: Add failing integration contracts

**Files:**
- Modify: packages/rw-create-task-plan/tests/test_skill_contract.py

**Interfaces:**
- Consumes: SKILL_PATH and the complete skill text.
- Produces: Contract tests for Figma UI tasks, component-library UI tasks, non-UI bypass, mandatory finding consumption, and visible unavailable-context handling.

- [ ] **Step 1: Add UI classification and invocation test**

Add a test method that requires these strings in the skill:

~~~python
    def test_routes_figma_and_component_library_work_to_discovered_components_engineer(self):
        self.assertIn("Classify the retrieved Jira issue before repository analysis or planning", self.skill)
        self.assertIn("a Figma URL or design reference", self.skill)
        self.assertIn("explicitly identifies a CRM UI-library component", self.skill)
        self.assertIn("discover the independently installed RW CRM Components Engineer", self.skill)
        self.assertIn("every detected Figma URL or design reference", self.skill)
        self.assertIn("Do not invent the engineer's skill name, MCP tool names, or output", self.skill)
~~~

- [ ] **Step 2: Add non-UI and finding-consumption test**

Add a second method that requires:

~~~python
    def test_preserves_non_ui_flow_and_surfaces_components_engineer_findings(self):
        self.assertIn("For a non-UI issue, do not discover or invoke the Components Engineer", self.skill)
        self.assertIn("Run the existing Create Task Plan workflow unchanged", self.skill)
        self.assertIn("mandatory input to both the displayed gap analysis and the created Superpowers plan", self.skill)
        self.assertIn("UI-context gap", self.skill)
        self.assertIn("continue the read-only planning workflow", self.skill)
~~~

- [ ] **Step 3: Verify RED**

Run:

~~~bash
cd packages/rw-create-task-plan
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_skill_contract.py -v
~~~

Expected: both new tests fail because no UI-task classifier or Components Engineer integration exists.

### Task 2: Add the discovery-based UI consultation workflow

**Files:**
- Modify: packages/rw-create-task-plan/skills/create-task-plan/SKILL.md
- Test: packages/rw-create-task-plan/tests/test_skill_contract.py

**Interfaces:**
- Consumes: Task 1 contracts, retrieved Rovo Jira evidence, existing parallel-worker summaries, and any installed Components Engineer interface.
- Produces: ui_related/non_ui classification; one read-only Components Engineer consultation for UI-related tasks; a structured finding joined to synthesis.

- [ ] **Step 1: Add Jira UI classification immediately after retrieval**

Add an Input and preflight step after Jira retrieval that tells the coordinator to classify before repository analysis or planning. It must define Figma/design references and explicit CRM UI-library/component evidence as triggers, record classification evidence, and reject generic screen/frontend/UI wording as insufficient.

- [ ] **Step 2: Add a Components Engineer consultation section before parallel analysis**

Add instructions that, for ui_related work, discover and invoke the independently installed RW CRM Components Engineer once through its documented read-only interface. Pass Jira key, URL, issue type, title, description, acceptance criteria, labels, attachments, links, related issues, classification evidence, and every detected Figma URL. Do not invent tool names. Require an equivalent status, evidence, component findings, risks/gaps, and questions response.

For a non-UI issue, do not discover or invoke the Components Engineer. Run the existing Create Task Plan workflow unchanged.

- [ ] **Step 3: Add structured-result synthesis rules**

Require an available engineer finding to be mandatory input to displayed gap analysis and created Superpowers plan. When discovery, invocation, Figma access, or component context is unavailable, continue read-only planning and add a UI-context gap that names unavailable source, impact, and follow-up. Do not invent component details.

- [ ] **Step 4: Align Figma discovery and parallel analysis**

Keep Figma read-only and consent-based. The Components Engineer receives Figma links regardless; it may use only the existing consented read-only Figma interface. For UI-related work, merge its report with the existing workers before synthesis. Keep the existing three-worker model routing and non-UI behavior unchanged.

- [ ] **Step 5: Verify GREEN**

Run:

~~~bash
cd packages/rw-create-task-plan
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_skill_contract.py -v
~~~

Expected: all contracts pass.

### Task 3: Validate and package the updated plugin

**Files:**
- Modify: packages/rw-create-task-plan/.codex-plugin/plugin.json
- Verify: packages/rw-create-task-plan/skills/create-task-plan/agents/openai.yaml
- Verify: packages/rw-create-task-plan/tests/test_skill_contract.py

**Interfaces:**
- Consumes: passing Task 2 contracts and existing personal marketplace registration.
- Produces: a validated cachebuster version and installed cache that matches source.

- [ ] **Step 1: Verify metadata and full validation**

Run:

~~~bash
cd packages/rw-create-task-plan
PYTHONDONTWRITEBYTECODE=1 python3 tests/test_skill_contract.py -v
python3 /Users/pol/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/create-task-plan
python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
python3 -m json.tool .codex-plugin/plugin.json >/dev/null
git diff --check
~~~

Expected: contracts, validators, JSON parsing, and whitespace checks pass.

- [ ] **Step 2: Refresh cachebuster, commit, and reinstall**

Run the plugin-creator cachebuster helper, commit only plugin-source changes on the existing feature branch, then reinstall with:

~~~bash
codex plugin add create-task-plan@personal
~~~

Confirm the installed SKILL.md at the cache version exactly matches source with cmp.

- [ ] **Step 3: Review scope**

Confirm git diff contains only the Create Task Plan skill, its contracts, generated cachebuster metadata, and this plan/spec documentation. Confirm no Components Engineer file changed.
