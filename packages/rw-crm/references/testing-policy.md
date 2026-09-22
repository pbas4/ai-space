# RW CRM testing policy

When working in a target application or component repository, RW CRM agents must run tests directly with the repository's Jest command. Inspect the repository's package scripts and Jest configuration, then use the narrowest relevant command, such as `npx jest <test-path> --runInBand` or the equivalent package-manager invocation.

Never invoke Nx directly or indirectly for verification. Do not run `nx test`, `nx run`, `npx nx`, or a package script that wraps an Nx target. If the relevant Jest command or configuration is missing, report the verification gap and do not substitute an Nx command or guess a replacement.

## Coverage scope

Choose direct tests and production coverage targets from observable production behavior. Exclude these files from production unit-test coverage, and do not add tests solely to execute excluded files:

- Pure barrel or re-export-only `index.ts(x)` files. An index module that implements a component, function, hook, object composition, initialization, or branching remains normal executable production code.
- Type-only files, including `.d.ts`, `types.ts(x)`, and `*.types.ts(x)`, when they contain no runtime values or behavior.
- Generated sources. Verify the generator, source schema, or meaningful integration boundary instead of generated output.
- Storybook stories. Verify them through configured story interaction or visual checks rather than production unit coverage.
- Test-only fixtures, mocks, and test utilities. A helper with meaningful reusable logic may have focused tests, but it is not part of production coverage.

A meaningful public-API contract test may import a barrel to verify its export surface; it must not exist merely to increase coverage. Filename alone never determines exclusion: keep executable behavior in coverage regardless of filename. Do not blanket-exclude runtime enums, constants, schemas, or custom configuration logic.

When changing Jest coverage configuration, follow the target repository's existing configuration structure. Prefer negative collectCoverageFrom patterns after positive patterns because Jest applies globs in order. Keep every exclusion narrow, and use `coveragePathIgnorePatterns` only when the inherited configuration makes a path-level regular expression more appropriate.

Record the exact Jest command and result in the structured verification output. This policy applies to component tests, regression tests, and test commands proposed in implementation plans. It does not replace the RW CRM package's own `npm run validate` command, which validates this agent package's Node-based contracts.
