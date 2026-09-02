import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function offlineEnvironment(cache) {
  return {
    ...process.env,
    npm_config_audit: "false",
    npm_config_cache: cache,
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_offline: "true",
    npm_config_registry: "http://127.0.0.1:9",
    npm_config_update_notifier: "false",
  };
}

async function runNpm(args, options) {
  try {
    return await execute(npm, args, {
      ...options,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const details = [error.stdout, error.stderr].filter(Boolean).join("\n");
    throw new Error(`npm ${args.join(" ")} failed\n${details}`, { cause: error });
  }
}

function verifyTarballListing(files) {
  const paths = new Set(files.map(({ path }) => path));
  const required = [
    ".codex-plugin/plugin.json",
    "dist/src/cli/main.js",
    "assets/skill/SKILL.md",
    "skills/repo-graph/SKILL.md",
    "DEPENDENCIES.md",
    "THIRD_PARTY_LICENSES/TypeScript.txt",
    "node_modules/typescript/LICENSE.txt",
    "node_modules/typescript/lib/typescript.js",
  ];
  const missing = required.filter((path) => !paths.has(path));
  const excluded = [...paths].filter(
    (path) =>
      path.startsWith("test/") ||
      path.startsWith("dist/test/") ||
      path.includes("/test/fixtures/") ||
      path.startsWith("src/"),
  );
  if (missing.length > 0 || excluded.length > 0) {
    throw new Error(
      [
        missing.length > 0 ? `missing required files: ${missing.join(", ")}` : "",
        excluded.length > 0 ? `included forbidden files: ${excluded.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function main() {
  const workspace = await mkdtemp(join(tmpdir(), "repo-graph-offline-pack-"));
  const packDestination = join(workspace, "pack");
  const packCache = join(workspace, "pack-cache");
  const installCache = join(workspace, "install-cache");
  const installPrefix = join(workspace, "install");
  await Promise.all([
    mkdir(packDestination),
    mkdir(packCache),
    mkdir(installCache),
    mkdir(installPrefix),
  ]);

  try {
    const packed = await runNpm(
      ["pack", "--json", "--pack-destination", packDestination],
      { cwd: process.cwd(), env: offlineEnvironment(packCache) },
    );
    const metadata = JSON.parse(packed.stdout)[0];
    if (metadata === undefined || !Array.isArray(metadata.files)) {
      throw new Error("npm pack did not return a file listing");
    }
    verifyTarballListing(metadata.files);
    if (!metadata.bundled?.includes("typescript")) {
      throw new Error("npm pack did not bundle TypeScript");
    }

    const temporaryTarball = join(packDestination, metadata.filename);
    await runNpm(
      [
        "install",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "--offline",
        "--prefix",
        installPrefix,
        temporaryTarball,
      ],
      { cwd: workspace, env: offlineEnvironment(installCache) },
    );

    const executable = join(
      installPrefix,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "repo-graph.cmd" : "repo-graph",
    );
    const invocation = await execute(executable, ["--version"], {
      cwd: workspace,
      encoding: "utf8",
      env: process.env,
    });
    if (invocation.stdout.trim() !== "0.1.0") {
      throw new Error(`installed repo-graph --version returned ${invocation.stdout.trim()}`);
    }

    const finalTarball = resolve(basename(metadata.filename));
    await copyFile(temporaryTarball, finalTarball);
    console.log(`offline artifact: ${finalTarball}`);
    console.log(`tarball files: ${metadata.files.length}`);
    console.log("empty-cache offline install: PASS");
    console.log("installed repo-graph --version: 0.1.0");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

await main();
