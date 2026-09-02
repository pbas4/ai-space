import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { main } from "../src/cli/main.js";
import { ExitCode } from "../src/domain/diagnostic.js";
import {
  type LocalRepository,
  resolveLocalRepository,
} from "../src/local/path-policy.js";
import {
  installProjectSkill,
  uninstallProjectSkill,
} from "../src/skill/install.js";

const skillAsset = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/skill/SKILL.md",
);
const startMarker = "<!-- repo-graph:start -->";
const endMarker = "<!-- repo-graph:end -->";

async function fixtureRepository(t: test.TestContext): Promise<{
  root: string;
  repo: LocalRepository;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "repo-graph-skill-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resolved = await resolveLocalRepository(root, process.cwd());
  assert.equal(resolved.ok, true);
  if (!resolved.ok) throw new Error("fixture repository did not resolve");
  return { root, repo: resolved.value };
}

async function missing(file: string): Promise<boolean> {
  try {
    await access(file);
    return false;
  } catch {
    return true;
  }
}

test("skill install is idempotent and preserves user content", async (t) => {
  const { root, repo } = await fixtureRepository(t);
  const originalAgents = "# Team rules\nKeep this line.\n";
  const originalIgnore = "coverage/\n";
  await Promise.all([
    writeFile(path.join(root, "AGENTS.md"), originalAgents),
    writeFile(path.join(root, ".gitignore"), originalIgnore),
  ]);

  const first = await installProjectSkill(repo);
  assert.equal(first.ok, true);
  const agentsOnce = await readFile(path.join(root, "AGENTS.md"), "utf8");
  const ignoreOnce = await readFile(path.join(root, ".gitignore"), "utf8");
  const skillOnce = await readFile(
    path.join(root, ".agents/skills/repo-graph/SKILL.md"),
    "utf8",
  );

  const second = await installProjectSkill(repo);

  assert.equal(second.ok, true);
  assert.equal(await readFile(path.join(root, "AGENTS.md"), "utf8"), agentsOnce);
  assert.equal(await readFile(path.join(root, ".gitignore"), "utf8"), ignoreOnce);
  assert.equal(
    await readFile(path.join(root, ".agents/skills/repo-graph/SKILL.md"), "utf8"),
    skillOnce,
  );
  assert.match(agentsOnce, /Keep this line/u);
  assert.equal(agentsOnce.slice(0, originalAgents.length), originalAgents);
  assert.equal(ignoreOnce.slice(0, originalIgnore.length), originalIgnore);
  assert.equal(agentsOnce.split(startMarker).length - 1, 1);
  assert.equal(agentsOnce.split(endMarker).length - 1, 1);
  assert.equal(ignoreOnce.split(".repo-graph/").length - 1, 1);
  assert.equal(skillOnce, await readFile(skillAsset, "utf8"));
  if (first.ok && second.ok) {
    assert.equal(first.value.changed, true);
    assert.equal(second.value.changed, false);
  }
});

test("skill install upgrades owned content without changing surrounding instructions", async (t) => {
  const { root, repo } = await fixtureRepository(t);
  const prefix = "# User prefix\nDo not change this.\n\n";
  const suffix = "\n\n# User suffix\nKeep this too.\n";
  await Promise.all([
    mkdir(path.join(root, ".agents/skills/repo-graph"), { recursive: true }),
    writeFile(
      path.join(root, "AGENTS.md"),
      `${prefix}${startMarker}\nold managed instructions\n${endMarker}${suffix}`,
    ),
    writeFile(path.join(root, ".gitignore"), "dist/\n.repo-graph/\nnotes/\n"),
  ]);
  await writeFile(
    path.join(root, ".agents/skills/repo-graph/SKILL.md"),
    "old skill\n",
  );
  const unrelated = path.join(root, ".agents/skills/team/SKILL.md");
  await mkdir(path.dirname(unrelated), { recursive: true });
  await writeFile(unrelated, "team-owned\n");

  const result = await installProjectSkill(repo);

  assert.equal(result.ok, true);
  const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
  assert.ok(agents.startsWith(prefix));
  assert.ok(agents.endsWith(suffix));
  assert.doesNotMatch(agents, /old managed instructions/u);
  assert.equal(await readFile(unrelated, "utf8"), "team-owned\n");
  assert.equal(
    await readFile(path.join(root, ".gitignore"), "utf8"),
    "dist/\n.repo-graph/\nnotes/\n",
  );
  assert.equal(
    await readFile(path.join(root, ".agents/skills/repo-graph/SKILL.md"), "utf8"),
    await readFile(skillAsset, "utf8"),
  );
});

test("skill uninstall removes only owned skill content", async (t) => {
  const { root, repo } = await fixtureRepository(t);
  const originalAgents = "# Team rules\nKeep this line.\n";
  const unrelated = path.join(root, ".agents/skills/team/SKILL.md");
  await mkdir(path.dirname(unrelated), { recursive: true });
  await Promise.all([
    writeFile(path.join(root, "AGENTS.md"), originalAgents),
    writeFile(path.join(root, ".gitignore"), "coverage/\n"),
    writeFile(unrelated, "team-owned\n"),
  ]);
  await installProjectSkill(repo);

  const first = await uninstallProjectSkill(repo);
  const agentsOnce = await readFile(path.join(root, "AGENTS.md"), "utf8");
  const second = await uninstallProjectSkill(repo);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(agentsOnce, originalAgents);
  assert.equal(await readFile(path.join(root, "AGENTS.md"), "utf8"), originalAgents);
  assert.equal(await missing(path.join(root, ".agents/skills/repo-graph")), true);
  assert.equal(await readFile(unrelated, "utf8"), "team-owned\n");
  assert.equal(await readFile(path.join(root, ".gitignore"), "utf8"), "coverage/\n.repo-graph/\n");
  if (first.ok && second.ok) {
    assert.equal(first.value.changed, true);
    assert.equal(second.value.changed, false);
  }
});

test("skill contains graph-first source-authoritative local instructions", async () => {
  const skill = await readFile(skillAsset, "utf8");

  assert.doesNotMatch(
    skill,
    /clone|fetch|pull|https?:|npm install|pnpm install|yarn add/i,
  );
  assert.match(skill, /repo-graph status/u);
  for (const command of ["query", "explain", "path", "impact"]) {
    assert.match(skill, new RegExp(`repo-graph ${command}`, "u"));
  }
  assert.match(skill, /budget/iu);
  assert.match(skill, /source span/iu);
  assert.match(skill, /uncertain edge/iu);
  assert.match(skill, /local search/iu);
  assert.match(skill, /graph.*navigation context/iu);
  assert.match(skill, /source.*authoritative/iu);
});

test("CLI installs and uninstalls the project skill", async (t) => {
  const { root } = await fixtureRepository(t);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io = {
    cwd: root,
    stdout: (value: string) => stdout.push(value),
    stderr: (value: string) => stderr.push(value),
  };

  assert.equal(await main(["skill", "install"], io), ExitCode.Ok);
  assert.equal(stderr.join(""), "");
  assert.match(stdout.join(""), /installed/iu);
  assert.equal(await missing(path.join(root, ".agents/skills/repo-graph/SKILL.md")), false);

  stdout.length = 0;
  assert.equal(await main(["skill", "uninstall"], io), ExitCode.Ok);
  assert.equal(stderr.join(""), "");
  assert.match(stdout.join(""), /uninstalled/iu);
  assert.equal(await missing(path.join(root, ".agents/skills/repo-graph")), true);
});

test("CLI exposes the graph query required by the installed skill", async (t) => {
  const { root } = await fixtureRepository(t);
  const stdout: string[] = [];
  const stderr: string[] = [];

  const result = await main(
    ["query", "authentication", "--budget", "300", "--format", "json"],
    {
      cwd: root,
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
  );

  assert.equal(result, ExitCode.MissingOrStaleIndex);
  assert.equal(stdout.join(""), "");
  assert.match(stderr.join(""), /MISSING_INDEX/u);
  assert.doesNotMatch(stderr.join(""), /INVALID_ARGUMENTS/u);
});
