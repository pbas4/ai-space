# RW CRM Components versioning policy

Apply this policy only when the current Git repository is the repository whose remote is `git@bitbucket.org:rwnl/rw-crm-components.git` (or its equivalent HTTPS URL) and the approved edit set changes a UI component under `libs/`.

For every such component change:

1. Identify the affected component library directory and update its `package.json` version.
2. Update the sibling `CHANGELOG.md` using the repository’s `CHANGELOG-GUIDE.md` and the component’s existing format.
3. Use semantic versioning: patch for fixes, minor for backwards-compatible features or new components, and major only for breaking changes with explicit user approval.
4. Ensure the changelog entry describes the user-visible change, includes the new version and date, and contains an `### Author` section naming `Pol`.
5. Include the package-version and changelog edits in the concrete code-edit set presented for approval. If the correct component package or changelog cannot be identified, stop and report the gap rather than guessing.
6. Verify that the component package version and changelog version agree before completion.

Do not apply this policy to the `ai-space` repository, the `packages/rw-crm` agent package, unrelated repositories, or non-component-only changes. Do not update the root `package.json` or root `CHANGELOG.md` unless the approved change targets the root package itself or the repository’s release convention explicitly requires it.
