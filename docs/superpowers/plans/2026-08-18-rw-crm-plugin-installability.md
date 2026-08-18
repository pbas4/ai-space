# RW CRM Plugin Installability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the RW CRM package portable as a standard Codex plugin and install a separate personal-marketplace copy for local testing.

**Architecture:** Keep `packages/rw-crm/` as the GitHub-ready source. Add the standard `skills` manifest path and required skill metadata there, then copy the validated package to `~/plugins/rw-crm` and register it through the default personal marketplace.

**Tech Stack:** Codex plugin manifest, Markdown skill frontmatter, Node validation, plugin-creator helper scripts, personal marketplace.

## Global Constraints

- Preserve all RW CRM package behavior and its five skill directories.
- Do not add repository-specific paths to the portable package manifest.
- Use a separate local copy for personal installation; do not make the marketplace source the repository checkout.
- Validate the repository package before copying and validate the installed copy before installing it.

### Task 1: Make the source package Codex-discoverable

**Files:**
- Modify: `packages/rw-crm/.codex-plugin/plugin.json`
- Modify: `packages/rw-crm/skills/*/SKILL.md`
- Test: `packages/rw-crm/test/profile-contract.test.mjs`

- [ ] Add the standard `"skills": "./skills/"` manifest field while retaining package metadata used by local validation.
- [ ] Add YAML frontmatter with a stable `name` and specific `description` to each of the five skills.
- [ ] Extend the profile contract test to assert the standard manifest field and every skill frontmatter block.
- [ ] Run `npm --prefix packages/rw-crm run validate`; expect all suites to pass.

### Task 2: Create and install the personal-marketplace copy

**Files:**
- Create outside the repository: `~/plugins/rw-crm/`
- Modify outside the repository: `~/.agents/plugins/marketplace.json`

- [ ] Copy the validated source package to `~/plugins/rw-crm/` without removing the repository source.
- [ ] Use the plugin-creator validator on the copied package; expect success.
- [ ] Use the plugin-creator marketplace helper to create or update the personal entry, then run `codex plugin add rw-crm@<personal-marketplace-name>`.
- [ ] Confirm `codex plugin list` includes `rw-crm`; instruct the user to open a new Codex task for discovery.
