from __future__ import annotations

import json
from pathlib import Path
import re
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = PACKAGE_ROOT / "skills" / "react-vertical-slices"


class ReactVerticalSlicesContractTest(unittest.TestCase):
    def test_required_package_files_exist(self):
        expected = (
            ".claude-plugin/plugin.json",
            ".codex-plugin/plugin.json",
            "README.md",
            "skills/react-vertical-slices/SKILL.md",
            "skills/react-vertical-slices/agents/openai.yaml",
            "skills/react-vertical-slices/references/architecture.md",
            "skills/react-vertical-slices/references/folder-conventions.md",
            "skills/react-vertical-slices/references/migration.md",
            "tests/behavior-scenarios.md",
            "tests/behavior-results.md",
        )

        missing = [path for path in expected if not (PACKAGE_ROOT / path).is_file()]

        self.assertEqual([], missing)

    def test_client_manifests_share_identity_and_version(self):
        claude = json.loads(
            (PACKAGE_ROOT / ".claude-plugin" / "plugin.json").read_text(
                encoding="utf-8"
            )
        )
        codex = json.loads(
            (PACKAGE_ROOT / ".codex-plugin" / "plugin.json").read_text(
                encoding="utf-8"
            )
        )

        for manifest in (claude, codex):
            self.assertEqual("react-vertical-slices", manifest["name"])
            self.assertEqual("0.1.0", manifest["version"])
            self.assertEqual("Pol", manifest["author"]["name"])

        self.assertEqual("./skills/", codex["skills"])
        self.assertEqual(
            {"name", "version", "description", "author"}, set(claude.keys())
        )

    def test_skill_frontmatter_is_portable(self):
        skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
        match = re.match(r"\A---\n(.*?)\n---\n", skill, re.DOTALL)

        self.assertIsNotNone(match)
        frontmatter = match.group(1)
        self.assertIn("name: react-vertical-slices", frontmatter)
        self.assertIn("description: Use when", frontmatter)
        keys = {
            line.split(":", 1)[0]
            for line in frontmatter.splitlines()
            if line and not line.startswith(" ")
        }
        self.assertEqual({"name", "description"}, keys)

    def test_codex_metadata_enables_implicit_and_explicit_invocation(self):
        metadata = (SKILL_ROOT / "agents" / "openai.yaml").read_text(
            encoding="utf-8"
        )

        self.assertIn('display_name: "React Vertical Slices"', metadata)
        self.assertIn("$react-vertical-slices", metadata)
        self.assertIn("allow_implicit_invocation: true", metadata)
        self.assertNotIn("dependencies:", metadata)

    def test_skill_routes_to_every_reference(self):
        skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")

        for reference in (
            "references/architecture.md",
            "references/folder-conventions.md",
            "references/migration.md",
        ):
            self.assertIn(reference, skill)
            self.assertTrue((SKILL_ROOT / reference).is_file())

    def test_shared_guidance_has_no_client_specific_instructions(self):
        shared_guidance = [SKILL_ROOT / "SKILL.md", *sorted((SKILL_ROOT / "references").glob("*.md"))]

        for path in shared_guidance:
            text = path.read_text(encoding="utf-8")
            for client_name in ("Codex", "Claude", "OpenAI", "Anthropic"):
                self.assertNotIn(client_name, text, f"{client_name!r} found in {path}")

    def test_local_markdown_links_are_relative_and_exist(self):
        markdown_link = re.compile(r"\[[^\]]+\]\(([^)]+)\)")

        for path in PACKAGE_ROOT.rglob("*.md"):
            for target in markdown_link.findall(path.read_text(encoding="utf-8")):
                if target.startswith(("https://", "http://", "#")):
                    continue

                target_path = target.split("#", 1)[0]
                self.assertFalse(Path(target_path).is_absolute(), target)
                self.assertTrue((path.parent / target_path).exists(), f"Broken link {target!r} in {path}")

    def test_package_has_no_product_specific_coupling_or_absolute_paths(self):
        forbidden = (
            "Real" + "works",
            "Rela" + "tions",
            "Leads" + "Manager",
            "RW " + "CRM",
            "N" + "x",
            "Je" + "st",
            "Ant" + "d",
            "/" + "Users/",
            "C:\\" + "Users\\",
        )
        checked = []
        for path in PACKAGE_ROOT.rglob("*"):
            if path.is_file() and path.suffix in {".md", ".json", ".yaml", ".py"}:
                checked.append(path)
                text = path.read_text(encoding="utf-8")
                for term in forbidden:
                    self.assertNotIn(term, text, f"{term!r} found in {path}")

        self.assertTrue(checked)

    def test_package_has_no_runtime_integrations_or_placeholders(self):
        self.assertFalse((PACKAGE_ROOT / ".mcp.json").exists())
        self.assertFalse((PACKAGE_ROOT / ".app.json").exists())
        self.assertFalse((PACKAGE_ROOT / "scripts").exists())
        self.assertFalse((PACKAGE_ROOT / "package.json").exists())

        text = "\n".join(
            path.read_text(encoding="utf-8")
            for path in PACKAGE_ROOT.rglob("*")
            if path.is_file() and path.suffix in {".md", ".json", ".yaml"}
        )
        self.assertNotIn("[" + "TODO:", text)
        self.assertNotIn("T" + "BD", text)

    def test_readme_documents_both_clients_and_portable_installation(self):
        readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")

        for expected in (
            "$react-vertical-slices",
            "/react-vertical-slices:react-vertical-slices",
            "~/.agents/skills/react-vertical-slices",
            "~/.claude/skills/react-vertical-slices",
            "claude --plugin-dir",
            "claude plugin validate",
        ):
            self.assertIn(expected, readme)


if __name__ == "__main__":
    unittest.main()
