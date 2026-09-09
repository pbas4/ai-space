import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const FORBIDDEN_MODULES = [
  "node:http",
  "node:https",
  "node:http2",
  "node:net",
  "node:tls",
  "node:dgram",
  "node:dns",
  "node:child_process",
  "undici",
] as const;

interface PolicyViolation {
  file: string;
  line: number;
  kind: string;
  value: string;
}

interface OfflinePolicyModule {
  scanProductionImports(
    root: string,
    forbiddenModules: readonly string[],
  ): Promise<PolicyViolation[]>;
}

async function loadPolicy(): Promise<OfflinePolicyModule> {
  const moduleUrl = pathToFileURL(
    resolve("scripts/check-production-imports.mjs"),
  ).href;
  return import(moduleUrl) as Promise<OfflinePolicyModule>;
}

test("production source contains no forbidden module imports", async () => {
  const { scanProductionImports } = await loadPolicy();
  const violations = await scanProductionImports("src", FORBIDDEN_MODULES);
  assert.deepEqual(violations, []);
});

test("all production package dependencies are approved", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies), ["typescript"]);
});

test("the packaged CLI entrypoint is directly executable", async () => {
  const entrypoint = await readFile("src/cli/main.ts", "utf8");
  assert.equal(entrypoint.startsWith("#!/usr/bin/env node\n"), true);
});

test("scanner detects every forbidden production execution surface", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "repo-graph-offline-policy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "violations.ts"),
    [
      'import https from "node:https";',
      'const client = await import("undici");',
      'const socket = require("node:net");',
      'import child = require("node:child_process");',
      'const tls = process.getBuiltinModule("tls");',
      'const pack = "npm pack";',
      'const remote = "git fetch origin";',
      'const registry = "--registry";',
      "const telemetry = false;",
      "",
    ].join("\n"),
  );

  const { scanProductionImports } = await loadPolicy();
  const violations = await scanProductionImports(root, FORBIDDEN_MODULES);
  assert.deepEqual(
    violations.map(({ kind }) => kind),
    [
      "forbidden-module",
      "forbidden-module",
      "forbidden-module",
      "forbidden-module",
      "builtin-module-access",
      "package-manager-command",
      "remote-git-command",
      "url-cli-option",
      "telemetry",
    ],
  );
});

test("scanner fails closed for non-literal module specifiers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "repo-graph-offline-policy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "dynamic-specifiers.ts"),
    [
      "declare const moduleName: string;",
      "await import(moduleName);",
      "require(moduleName);",
      "process.getBuiltinModule(moduleName);",
      "",
    ].join("\n"),
  );

  const { scanProductionImports } = await loadPolicy();
  const violations = await scanProductionImports(root, FORBIDDEN_MODULES);
  assert.deepEqual(
    violations.map(({ line, kind, value }) => ({ line, kind, value })),
    [
      { line: 2, kind: "non-literal-module-specifier", value: "moduleName" },
      { line: 3, kind: "non-literal-module-specifier", value: "moduleName" },
      { line: 4, kind: "non-literal-module-specifier", value: "moduleName" },
    ],
  );
});
