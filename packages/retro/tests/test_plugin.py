"""Packaging contracts and real subprocess checks; not live agent verification."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib
import unittest


PACKAGE = Path(__file__).resolve().parents[1]
ROOT = PACKAGE.parents[1]
SKILL = PACKAGE / "skills/retro"
ROLES = ("interviewer", "rule_designer", "verifier")
TOOLS = {
    "interviewer": {"Read", "Grep", "Glob"},
    "rule_designer": {"Read", "Grep", "Glob", "Edit", "Write", "Bash"},
    "verifier": {"Read", "Grep", "Glob", "Bash"},
}


def yaml_load(text):
    """Use a real YAML parser without adding a package runtime dependency."""
    result = subprocess.run(
        ["ruby", "-ryaml", "-rjson", "-e",
         "puts JSON.generate(YAML.safe_load(STDIN.read))"],
        input=text, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def frontmatter(path):
    text = path.read_text()
    header, body = text.removeprefix("---\n").split("\n---\n", 1)
    return yaml_load(header), body


class PackagingTests(unittest.TestCase):
    def test_complete_package(self):
        files = ["README.md", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json",
                 "skills/retro/SKILL.md", "skills/retro/agents/openai.yaml",
                 "skills/retro/references/roles.md", "skills/retro/references/report-template.md",
                 "examples/check-plugin-versions.mjs", "tests/behavior-scenarios.md"]
        for name in files:
            with self.subTest(file=name):
                self.assertTrue((PACKAGE / name).is_file(), f"Missing {name}")

    def test_skill_and_invocation_policy_parse(self):
        header, body = frontmatter(SKILL / "SKILL.md")
        self.assertEqual(header["name"], "retro")
        self.assertTrue(header["description"])
        ui = yaml_load((SKILL / "agents/openai.yaml").read_text())
        self.assertIs(ui["policy"]["allow_implicit_invocation"], False)
        self.assertIn("$retro", ui["interface"]["default_prompt"])
        self.assertIn("references/roles.md", body)
        self.assertIn("references/report-template.md", body)
        self.assertTrue((SKILL / "references/roles.md").is_file())
        for role in ROLES:
            with self.subTest(claude_coordinator_role=role):
                self.assertIn(f"`retro:retro-{role.replace('_', '-')}`", body)

    def test_exactly_three_equivalent_client_wrappers(self):
        codex = sorted((PACKAGE / "agents").glob("*.toml"))
        claude = sorted((PACKAGE / "agents").glob("*.md"))
        self.assertEqual(len(codex), 3)
        self.assertEqual(len(claude), 3)
        for role in ROLES:
            with self.subTest(role=role):
                data = tomllib.loads((PACKAGE / f"agents/retro_{role}.toml").read_text())
                self.assertEqual(set(data), {"name", "description", "developer_instructions"})
                self.assertEqual(data["name"], f"retro_{role}")
                header, body = frontmatter(PACKAGE / f"agents/retro-{role.replace('_', '-')}.md")
                self.assertEqual(header["name"], f"retro-{role.replace('_', '-')}")
                self.assertEqual(set(header["tools"]), TOOLS[role])
                self.assertEqual(header["skills"], ["retro:retro"])
                self.assertNotIn("model", header)
                for instructions in (data["developer_instructions"], body):
                    self.assertIn(f"specialist mode: {role}", instructions)
                    self.assertIn("references/roles.md", instructions)
                    self.assertIn("loaded skill", instructions)
                    self.assertNotIn("../skills", instructions)
                    self.assertIn("Do not delegate", instructions)
                self.assertIn("$retro", data["developer_instructions"])

    def test_shared_role_contracts_and_report_traceability(self):
        roles = (SKILL / "references/roles.md").read_text()
        for anchor in ROLES:
            self.assertIn(f"## {anchor}", roles)
        # Handoff fields needed by downstream specialists, rather than duplicated wrappers.
        for field in ("finding_id", "recurrence", "authorization", "fail_example", "pass_example",
                      "false_positives", "verification_command", "unverified_claims"):
            self.assertIn(field, roles)
        report = (SKILL / "references/report-template.md").read_text()
        for field in ("finding_id", "Declined", "Verification", "Remaining"):
            self.assertIn(field, report)

    def test_manifests_marketplaces_and_alias_agree(self):
        manifests = [json.loads((PACKAGE / host / "plugin.json").read_text())
                     for host in (".codex-plugin", ".claude-plugin")]
        for manifest in manifests:
            self.assertEqual(manifest["name"], "retro")
            self.assertEqual(manifest["version"], "0.1.0")
        for host, manifest in zip((".agents/plugins", ".claude-plugin"), manifests):
            marketplace = json.loads((ROOT / host / "marketplace.json").read_text())
            entries = [entry for entry in marketplace["plugins"] if entry["name"] == "retro"]
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["version"], manifest["version"])
            self.assertEqual(entries[0]["description"], manifest["description"])
        alias = ROOT / ".agents/plugins/plugins/retro"
        self.assertTrue(alias.is_symlink())
        self.assertEqual(alias.readlink().as_posix(), "../../../packages/retro")
        self.assertEqual(alias.resolve(), PACKAGE)


class VersionExampleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.fixture = Path(self.temp.name)
        self.check = PACKAGE / "examples/check-plugin-versions.mjs"
        for host in (".codex-plugin", ".claude-plugin"):
            (self.fixture / host).mkdir()
            self.write_manifest(host, "0.1.0")

    def write_manifest(self, host, version):
        path = self.fixture / host / "plugin.json"
        path.write_text(json.dumps({"name": "demo", "version": version}))
        return path

    def run_check(self, *args):
        self.assertTrue(self.check.is_file(), "Version CLI missing")
        return subprocess.run(["node", str(self.check), *map(str, args)], capture_output=True, text=True)

    def test_matching_versions_pass_without_mutating_files(self):
        before = {p: p.read_bytes() for p in self.fixture.rglob("*.json")}
        result = self.run_check(self.fixture)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("0.1.0", result.stdout)
        for path, content in before.items():
            self.assertIn(str(path), result.stdout)
            self.assertEqual(path.read_bytes(), content)

    def test_valid_prerelease_and_build_metadata_pass(self):
        for host in (".codex-plugin", ".claude-plugin"):
            self.write_manifest(host, "1.2.3-rc.1+build.9")
        self.assertEqual(self.run_check(self.fixture).returncode, 0)

    def test_drift_is_rejected(self):
        self.write_manifest(".claude-plugin", "0.1.1")
        result = self.run_check(self.fixture)
        self.assertEqual(result.returncode, 1)
        self.assertIn("mismatch", result.stderr.lower())

    def test_malformed_versions_are_rejected(self):
        for version in (None, 1, "", "0.1", "v0.1.0", "01.1.0", "1.0.0-01", "1.0.0+", "0.1.0\n"):
            with self.subTest(version=version):
                self.write_manifest(".codex-plugin", version)
                result = self.run_check(self.fixture)
                self.assertEqual(result.returncode, 1)
                self.assertIn("version", result.stderr.lower())

    def test_missing_version_is_rejected(self):
        (self.fixture / ".codex-plugin/plugin.json").write_text('{}')
        self.assertEqual(self.run_check(self.fixture).returncode, 1)

    def test_missing_manifest_and_invalid_json_are_rejected(self):
        path = self.fixture / ".codex-plugin/plugin.json"
        for content in ("invalid json", None, "null", "[]"):
            with self.subTest(content=content):
                if content is None:
                    path.unlink()
                else:
                    path.write_text(content)
                result = self.run_check(self.fixture)
                self.assertEqual(result.returncode, 1)
                self.assertIn(str(path), result.stderr)

    def test_omitted_directory_gives_usage(self):
        result = self.run_check()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage:", result.stderr)


class MarketplaceValidatorTests(unittest.TestCase):
    def test_retro_drift_and_broken_alias_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp)
            (fixture / "scripts").mkdir()
            shutil.copy(ROOT / "scripts/validate-marketplaces.mjs", fixture / "scripts")
            for host in (".agents/plugins", ".claude-plugin"):
                (fixture / host).mkdir(parents=True)
                shutil.copy(ROOT / host / "marketplace.json", fixture / host)
            for package in (ROOT / "packages").iterdir():
                for host in (".codex-plugin", ".claude-plugin"):
                    source = package / host / "plugin.json"
                    if source.is_file():
                        target = fixture / "packages" / package.name / host
                        target.mkdir(parents=True)
                        shutil.copy(source, target)
            alias = fixture / ".agents/plugins/plugins/retro"
            alias.parent.mkdir()
            alias.symlink_to("../../../packages/retro")

            def run():
                return subprocess.run(["node", str(fixture / "scripts/validate-marketplaces.mjs")],
                                      capture_output=True, text=True)

            result = run()
            self.assertEqual(result.returncode, 0, result.stderr)
            marketplace = fixture / ".claude-plugin/marketplace.json"
            original_marketplace = marketplace.read_text()
            for field, value in (("version", "9.9.9"), ("description", "Incorrect description"),
                                 ("category", "Incorrect category")):
                with self.subTest(marketplace_field=field):
                    data = json.loads(original_marketplace)
                    next(entry for entry in data["plugins"] if entry["name"] == "retro")[field] = value
                    marketplace.write_text(json.dumps(data))
                    result = run()
                    self.assertNotEqual(result.returncode, 0, f"Validator accepted {field} drift")
                    self.assertIn("retro", result.stderr)
            marketplace.write_text(original_marketplace)
            manifest = fixture / "packages/retro/.claude-plugin/plugin.json"
            self.assertTrue(manifest.is_file(), "Retro manifest missing")
            original = manifest.read_text()
            data = json.loads(original)
            data["version"] = "0.1.1"
            manifest.write_text(json.dumps(data))
            result = run()
            self.assertNotEqual(result.returncode, 0, "Validator accepted manifest drift")
            self.assertIn("retro", result.stderr)
            manifest.write_text(original)
            alias.unlink()
            alias.symlink_to("../../../packages/missing")
            result = run()
            self.assertNotEqual(result.returncode, 0, "Validator accepted broken alias")
            self.assertIn("retro", result.stderr)


if __name__ == "__main__":
    unittest.main()
