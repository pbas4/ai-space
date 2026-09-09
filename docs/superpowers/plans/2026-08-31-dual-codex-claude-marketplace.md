# Dual Codex and Claude Code Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `rw-crm` and `rw-create-task-plan` independently installable from the GitHub repository as plugins in Codex and Claude Code.

**Architecture:** Keep `packages/` as the source of truth. Add Claude Code metadata at `.claude-plugin/` and Codex marketplace metadata at `.agents/plugins/`, plus one host-specific plugin manifest inside each package. Use Claude Code relative package sources and Codex repository-root Git sources so each package remains independently selectable without duplicating files.

**Tech Stack:** JSON manifests, Markdown documentation, Python validation tests, existing Node.js package validation scripts.

## Global Constraints

- Each package has a distinct installable entry and host-specific manifest. The `rw-create-task-plan` directory retains its established technical plugin identifier `create-task-plan` for Codex compatibility.
- Codex and Claude Code metadata are kept separate where their schemas differ.
- Shared behavior remains in the existing package files; compatibility metadata may reference those files.
- No unsupported fields will be added to either platform's manifest.
- Existing package behavior and tests must remain unchanged.
- Marketplace validation must confirm both entries exist and resolve to independently installable packages.
- Do not copy package files into a generated `dist/` directory.

---

### Task 1: Add host-specific plugin manifests

**Files:**
- Create: `packages/rw-crm/.claude-plugin/plugin.json`
- Create: `packages/rw-crm/.codex-plugin/plugin.json`
- Create: `packages/rw-create-task-plan/.claude-plugin/plugin.json`
- Create: `packages/rw-create-task-plan/.codex-plugin/plugin.json`

**Interfaces:**
- Consumes: Existing package names, descriptions, skills, agents, references, schemas, and scripts.
- Produces: Four valid manifests whose plugin names match their containing package directories.

- [ ] **Step 1: Create Claude Code manifests**

  Use the Claude Code manifest shape with `name`, `description`, `version`, `author`, and explicit component paths where needed. The `rw-crm` manifest must expose `skills`, `agents`, and no components that do not exist. The `rw-create-task-plan` manifest must expose its `skills` and `agents` directories.

- [ ] **Step 2: Create Codex manifests**

  Use the accepted Codex plugin manifest shape, keeping the names `rw-crm` and `rw-create-task-plan` and referencing only the package components that exist.

- [ ] **Step 3: Parse and inspect all manifests**

  Run:

  ```bash
  python3 -c 'import json, pathlib; paths=[pathlib.Path("packages/rw-crm/.claude-plugin/plugin.json"), pathlib.Path("packages/rw-crm/.codex-plugin/plugin.json"), pathlib.Path("packages/rw-create-task-plan/.claude-plugin/plugin.json"), pathlib.Path("packages/rw-create-task-plan/.codex-plugin/plugin.json")]; [print(p, json.load(p)["name"]) for p in paths]'
  ```

  Expected: four paths print with names `rw-crm`, `rw-crm`, `rw-create-task-plan`, and `rw-create-task-plan`.

- [ ] **Step 4: Commit the manifests**

  ```bash
  git add packages/rw-crm/.claude-plugin packages/rw-crm/.codex-plugin packages/rw-create-task-plan/.claude-plugin packages/rw-create-task-plan/.codex-plugin
  git commit -m "feat: add independent plugin manifests"
  ```

### Task 2: Add marketplace catalogs

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `.agents/plugins/marketplace.json`

**Interfaces:**
- Consumes: The four package manifests from Task 1.
- Produces: One Claude Code marketplace and one Codex marketplace, each listing both packages independently.

- [ ] **Step 1: Add the Claude Code marketplace catalog**

  Create a root marketplace named `ai-space`, with owner metadata for `pbas4`, and entries whose sources are exactly `./packages/rw-crm` and `./packages/rw-create-task-plan`.

- [ ] **Step 2: Add the Codex marketplace catalog**

  Create `.agents/plugins/marketplace.json` as a Codex marketplace named `ai-space`, with one repository-root Git source entry for `rw-crm` and one repository-root Git source entry for the established `create-task-plan` plugin identifier. Include required installation policy, authentication policy, and category fields for both entries.

- [ ] **Step 3: Validate catalog structure and paths**

  Run:

  ```bash
  python3 - <<'PY'
  import json
  from pathlib import Path

  for catalog_path in (Path('.claude-plugin/marketplace.json'), Path('.agents/plugins/marketplace.json')):
      catalog = json.loads(catalog_path.read_text())
      expected = {'rw-crm', 'rw-create-task-plan'} if catalog_path.parts[0] == '.claude-plugin' else {'rw-crm', 'create-task-plan'}
      assert {entry['name'] for entry in catalog['plugins']} == expected
      if catalog_path.parts[0] == '.claude-plugin':
          for entry in catalog['plugins']:
              assert Path(entry['source']).is_dir(), (catalog_path, entry['source'])
      print(f'{catalog_path}: valid')
  PY
  ```

  Expected: both catalogs print `valid`.

- [ ] **Step 4: Commit the catalogs**

  ```bash
  git add .claude-plugin/marketplace.json .agents/plugins/marketplace.json
  git commit -m "feat: add dual plugin marketplaces"
  ```

### Task 3: Add installation and validation documentation

**Files:**
- Modify: `README.md`
- Modify: `packages/README.md`
- Modify: `packages/rw-crm/README.md`
- Modify: `packages/rw-create-task-plan/README.md`
- Create: `scripts/validate-marketplaces.mjs`

**Interfaces:**
- Consumes: Root catalogs and package manifests from Tasks 1 and 2.
- Produces: User-facing GitHub installation instructions and a repeatable validation command.

- [ ] **Step 1: Add a validation script**

  Implement `scripts/validate-marketplaces.mjs` to parse both catalogs, assert the exact two plugin names, resolve each source path relative to the repository root, and assert the expected host-specific manifest exists in each package. Exit non-zero with a clear message on failure.

- [ ] **Step 2: Add installation instructions**

  Document the GitHub repository `pbas4/ai-space`, the Claude Code `/plugin marketplace add` and `/plugin install <plugin>@ai-space` commands, and the Codex marketplace installation flow. State that the two packages are independently installable and list both plugin names.

- [ ] **Step 3: Run the validation script**

  Run:

  ```bash
  node scripts/validate-marketplaces.mjs
  ```

  Expected: the script reports both marketplaces and both plugins as valid and exits with status 0.

- [ ] **Step 4: Commit documentation and validation**

  ```bash
  git add README.md packages/README.md packages/rw-crm/README.md packages/rw-create-task-plan/README.md scripts/validate-marketplaces.mjs
  git commit -m "docs: document plugin marketplace installation"
  ```

### Task 4: Run full verification

**Files:**
- Test: `scripts/validate-marketplaces.mjs`
- Test: `packages/rw-crm/scripts/validate-package.mjs`
- Test: existing package tests

**Interfaces:**
- Consumes: All marketplace and package metadata.
- Produces: Verified branch state with no unintended tracked changes.

- [ ] **Step 1: Run marketplace validation**

  ```bash
  node scripts/validate-marketplaces.mjs
  ```

- [ ] **Step 2: Run package validation and tests**

  ```bash
  node packages/rw-crm/scripts/validate-package.mjs
  python3 -m pytest packages/rw-create-task-plan/tests/test_skill_contract.py -q
  node --test packages/rw-crm/test/*.test.mjs
  ```

- [ ] **Step 3: Check the final branch state**

  ```bash
  git status --short --branch
  git log --oneline --decorate -5
  ```

  Expected: branch is `codex/dual-codex-claude-marketplace`, all intended changes are committed, and only the pre-existing untracked `packages/rw-create-task-plan/tests/__pycache__/` remains untracked.

- [ ] **Step 4: Commit any final verification-only adjustments**

  If verification requires a metadata or documentation correction, commit it with:

  ```bash
  git add <corrected-files>
  git commit -m "fix: align marketplace validation"
  ```
