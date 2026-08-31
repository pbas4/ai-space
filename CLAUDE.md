# Repository Contribution Rules

These rules apply to every change in this repository and take precedence over package-local guidance when the instructions conflict.

## Required release hygiene

For every change that adds, removes, or changes a package, plugin skill, agent, script, reference, schema, or plugin behavior:

1. Always upgrade the package version when a version exists. Use at least a patch increment for a backward-compatible change; use minor or major increments when the change requires it. Keep versions synchronized across the package's `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, and any package manifest that declares the plugin version.
2. Always review the affected package README, root `README.md`, and `packages/README.md`. Update documentation whenever the change affects installation, usage, capabilities, configuration, workflows, compatibility, or validation. Do not claim that docs were updated if the review found no required change; record that the review was performed in the change summary.
3. Always update both plugin marketplaces when a package or plugin metadata changes:
   - Codex: `.agents/plugins/marketplace.json`
   - Claude Code: `.claude-plugin/marketplace.json`
   Keep names, descriptions, versions, categories, and source paths accurate. Add or remove marketplace-local Codex aliases under `.agents/plugins/plugins/` when packages are added or removed.

Documentation-only changes that do not affect package behavior, metadata, installation, or usage do not require a version bump or marketplace update, but the exception must be explicit in the change summary.

## Verification before completion

Run the relevant checks for every package changed, plus:

```bash
node scripts/validate-marketplaces.mjs
git diff --check
```

For plugin changes, validate every affected package with:

```bash
python3 /Users/pol/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py <package-path>
```

Do not declare the work complete until version, documentation, and both marketplace reviews are complete and the relevant tests pass.
