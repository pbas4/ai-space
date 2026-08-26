# RW CRM testing policy

When working in a target application or component repository, RW CRM agents must run tests directly with the repository's Jest command. Inspect the repository's package scripts and Jest configuration, then use the narrowest relevant command, such as `npx jest <test-path> --runInBand` or the equivalent package-manager invocation.

Never invoke Nx directly or indirectly for verification. Do not run `nx test`, `nx run`, `npx nx`, or a package script that wraps an Nx target. If the relevant Jest command or configuration is missing, report the verification gap and do not substitute an Nx command or guess a replacement.

Record the exact Jest command and result in the structured verification output. This policy applies to component tests, regression tests, and test commands proposed in implementation plans. It does not replace the RW CRM package's own `npm run validate` command, which validates this agent package's Node-based contracts.
