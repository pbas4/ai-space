# Dependency Inventory

The `repo-graph` CLI is designed to work completely offline. Production commands never invoke a package manager or install or modify dependencies in a target repository.

| Dependency | Version | Purpose | License | Bundled |
| --- | --- | --- | --- | --- |
| Node.js | `>=22.13.0` | Required runtime providing filesystem, hashing, CLI parsing, testing, and `node:sqlite` APIs. | Node.js license (MIT and included third-party notices) | No; installed once on the developer machine. |
| TypeScript | `6.0.3` | Only third-party runtime library; provides parsing, programs, module resolution, and type checking. | Apache-2.0 | Yes; bundled with release artifacts as the fallback compiler. |
| `@types/node` | `22.20.1` | Direct build-only Node.js type declarations. | MIT | No; development/build environment only. |
| `undici-types` | `6.21.0` | Transitive build-only type declarations required by `@types/node`. | MIT | No; development/build environment only. |

The tool may load a compatible TypeScript compiler already present in a target repository, but it never installs one there. No production command invokes `npm`, `pnpm`, `yarn`, `bun`, or another package manager.

`npm run check:offline` statically checks production source and built output for
network modules, process spawning, remote Git commands, package-manager commands,
URL-bearing CLI options, telemetry, and imports not declared above. It also checks
the lockfile against this inventory. `npm run pack:offline` builds a release
tarball, confirms that TypeScript and its license are bundled, rejects test and
repository fixture files, and installs the tarball using an empty cache with npm's
offline mode enabled before invoking `repo-graph --version`.
