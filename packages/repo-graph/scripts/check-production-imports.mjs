import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

export const FORBIDDEN_MODULES = Object.freeze([
  "node:http",
  "node:https",
  "node:http2",
  "node:net",
  "node:tls",
  "node:dgram",
  "node:dns",
  "node:child_process",
  "undici",
]);

const BUILTINS = new Set(
  builtinModules.flatMap((name) => [name, name.replace(/^node:/u, "")]),
);
const PACKAGE_MANAGER_COMMAND = /\b(?:npm|pnpm|yarn|bun)\s+[a-z][a-z0-9:-]*\b/iu;
const REMOTE_GIT_COMMAND = /\bgit\s+(?:clone|fetch|ls-remote|pull|push|remote\s+add)\b/iu;
const URL_CLI_OPTION = /(?:--(?:endpoint|registry|remote|url)\b|--[a-z][a-z0-9-]*(?:=|\s+)https?:\/\/)/iu;
const TELEMETRY_NAME = /\b(?:analytics|datadog|opentelemetry|sentry|telemetry)\b/iu;

function packageName(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/", 1)[0];
}

function isForbiddenSpecifier(specifier, forbiddenModules) {
  const normalized = specifier.startsWith("node:")
    ? specifier
    : BUILTINS.has(specifier)
      ? `node:${specifier}`
      : specifier;
  return forbiddenModules.some(
    (forbidden) => normalized === forbidden || normalized.startsWith(`${forbidden}/`),
  );
}

async function sourceFiles(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      if (entry.isFile() && /\.(?:js|ts)$/u.test(entry.name)) files.push(path);
    }
  };
  await visit(resolve(root));
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

async function declaredDependencies() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  return new Set(Object.keys(pkg.dependencies ?? {}));
}

/**
 * Statically inspect production TypeScript and JavaScript without executing it.
 */
export async function scanProductionImports(
  root,
  forbiddenModules = FORBIDDEN_MODULES,
  declared = undefined,
) {
  const rootPath = resolve(root);
  const allowedPackages = declared ?? (await declaredDependencies());
  const violations = [];

  const addViolation = (sourceFile, node, kind, value) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      file: relative(rootPath, sourceFile.fileName).split(sep).join("/"),
      line: line + 1,
      kind,
      value,
    });
  };

  const inspectModule = (sourceFile, node, specifier) => {
    if (isForbiddenSpecifier(specifier, forbiddenModules)) {
      addViolation(sourceFile, node, "forbidden-module", specifier);
      return;
    }
    if (/^(?:https?|ssh|git):/iu.test(specifier) || specifier.startsWith("git@")) {
      addViolation(sourceFile, node, "remote-module-specifier", specifier);
      return;
    }
    if (
      specifier.startsWith(".") ||
      specifier.startsWith("/") ||
      specifier.startsWith("#") ||
      specifier.startsWith("node:") ||
      BUILTINS.has(specifier)
    ) {
      return;
    }
    const dependency = packageName(specifier);
    if (!allowedPackages.has(dependency)) {
      addViolation(sourceFile, node, "undeclared-dependency", dependency);
    }
  };

  for (const file of await sourceFiles(rootPath)) {
    const source = await readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    );
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        inspectModule(sourceFile, node.moduleSpecifier, node.moduleSpecifier.text);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression !== undefined &&
        ts.isStringLiteralLike(node.moduleReference.expression)
      ) {
        inspectModule(
          sourceFile,
          node.moduleReference.expression,
          node.moduleReference.expression.text,
        );
      } else if (ts.isCallExpression(node)) {
        const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire =
          ts.isIdentifier(node.expression) && node.expression.text === "require";
        const isBuiltinAccess =
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "process" &&
          node.expression.name.text === "getBuiltinModule";
        if (isImport || isRequire || isBuiltinAccess) {
          const argument = node.arguments[0];
          if (argument === undefined || !ts.isStringLiteralLike(argument)) {
            addViolation(
              sourceFile,
              argument ?? node.expression,
              "non-literal-module-specifier",
              argument?.getText(sourceFile) ?? "<missing>",
            );
          } else if (isBuiltinAccess) {
            const specifier = argument.text.startsWith("node:")
              ? argument.text
              : `node:${argument.text}`;
            addViolation(sourceFile, argument, "builtin-module-access", specifier);
          } else {
            inspectModule(sourceFile, argument, argument.text);
          }
        }
      }

      if (ts.isStringLiteralLike(node)) {
        const checks = [
          [PACKAGE_MANAGER_COMMAND, "package-manager-command"],
          [REMOTE_GIT_COMMAND, "remote-git-command"],
          [URL_CLI_OPTION, "url-cli-option"],
          [TELEMETRY_NAME, "telemetry"],
        ];
        for (const [pattern, kind] of checks) {
          if (pattern.test(node.text)) addViolation(sourceFile, node, kind, node.text);
        }
      }
      if (ts.isIdentifier(node) && TELEMETRY_NAME.test(node.text)) {
        addViolation(sourceFile, node, "telemetry", node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file, "en") ||
      left.line - right.line ||
      left.kind.localeCompare(right.kind, "en") ||
      left.value.localeCompare(right.value, "en"),
  );
}

function dependencyRows(pkg, lock) {
  const directRuntime = pkg.dependencies ?? {};
  const directBuild = pkg.devDependencies ?? {};
  const rows = [];
  for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
    if (path === "" || !path.includes("node_modules/")) continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const kind = metadata.dev === true ? "build-only" : "runtime";
    const direct = Object.hasOwn(
      kind === "runtime" ? directRuntime : directBuild,
      name,
    );
    rows.push({ name, version: metadata.version, kind, direct });
  }
  return rows.sort(
    (left, right) =>
      (left.kind === right.kind ? 0 : left.kind === "runtime" ? -1 : 1) ||
      (left.direct === right.direct ? 0 : left.direct ? -1 : 1) ||
      left.name.localeCompare(right.name, "en"),
  );
}

function dependencyIsDocumented(documentation, row) {
  const escapedName = row.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const escapedVersion = String(row.version).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    "\\|\\s*`?" + escapedName + "`?\\s*\\|\\s*`" + escapedVersion + "`",
    "iu",
  ).test(documentation);
}

export async function inspectDependencies() {
  const [packageText, lockText, documentation] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("package-lock.json", "utf8"),
    readFile("DEPENDENCIES.md", "utf8"),
  ]);
  const pkg = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const rows = dependencyRows(pkg, lock);
  const problems = [];
  const lockRoot = lock.packages?.[""] ?? {};

  for (const section of ["dependencies", "devDependencies"]) {
    const manifestDependencies = pkg[section] ?? {};
    const lockedDependencies = lockRoot[section] ?? {};
    for (const [name, version] of Object.entries(manifestDependencies)) {
      if (lockedDependencies[name] !== version) {
        problems.push(`${section} ${name}@${version} does not match package-lock.json`);
      }
      const row = rows.find((candidate) => candidate.name === name);
      if (row === undefined || row.version !== version) {
        problems.push(`${section} ${name}@${version} is not locked exactly`);
      }
    }
  }
  for (const row of rows) {
    if (!dependencyIsDocumented(documentation, row)) {
      problems.push(`undisclosed package ${row.name}@${row.version}`);
    }
  }
  return { rows, problems };
}

async function pathExists(path) {
  try {
    await readdir(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function run() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const declared = new Set(Object.keys(pkg.dependencies ?? {}));
  const roots = ["src"];
  if (await pathExists("dist/src")) roots.push("dist/src");
  const violations = (
    await Promise.all(
      roots.map((root) => scanProductionImports(root, FORBIDDEN_MODULES, declared)),
    )
  ).flat();
  const inventory = await inspectDependencies();

  for (const row of inventory.rows) {
    const relationship = row.direct ? "direct" : "transitive";
    const bundled = row.kind === "runtime" && pkg.bundleDependencies?.includes(row.name)
      ? ", bundled"
      : "";
    console.log(`${row.kind}: ${row.name}@${row.version} (${relationship}${bundled})`);
  }
  console.log(
    inventory.problems.length === 0
      ? "undisclosed packages: none"
      : `dependency policy problems: ${inventory.problems.length}`,
  );
  for (const problem of inventory.problems) console.error(problem);
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}: ${violation.kind}: ${violation.value}`,
    );
  }
  if (inventory.problems.length > 0 || violations.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log("offline production policy: PASS");
}

const entryPath = process.argv[1];
if (entryPath !== undefined && pathToFileURL(resolve(entryPath)).href === import.meta.url) {
  await run();
}
