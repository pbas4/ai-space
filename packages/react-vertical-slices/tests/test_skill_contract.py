from __future__ import annotations

import json
from pathlib import Path
import re
import tempfile
import tomllib
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = PACKAGE_ROOT / "skills" / "react-vertical-slices"
AGENT_ROOT = PACKAGE_ROOT / "agents"
AGENT_PATHS = (
    AGENT_ROOT / "react_vertical_slices_reviewer.toml",
    AGENT_ROOT / "react_vertical_slices_migrator.toml",
)
CLAUDE_AGENT_PATHS = (
    AGENT_ROOT / "react-vertical-slices-reviewer.md",
    AGENT_ROOT / "react-vertical-slices-migrator.md",
)
ALL_AGENT_PATHS = (*AGENT_PATHS, *CLAUDE_AGENT_PATHS)
FRONTMATTER_KEY = re.compile(r"[a-z][a-z0-9_-]*\Z")
PLAIN_FRONTMATTER_SCALAR = re.compile(r"[A-Za-z0-9][^\r\n]*\Z")


def parse_plain_frontmatter_scalar(value: str, path: Path) -> str:
    if (
        PLAIN_FRONTMATTER_SCALAR.fullmatch(value) is None
        or ": " in value
        or " #" in value
    ):
        raise AssertionError(f"Invalid frontmatter scalar in {path}: {value!r}")
    return value


def parse_markdown_agent(path: Path) -> tuple[dict[str, object], str]:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---\n(.*)\Z", text, re.DOTALL)
    if match is None:
        raise AssertionError(f"Invalid agent frontmatter: {path}")

    metadata: dict[str, object] = {}
    active_list: list[str] | None = None
    for line in match.group(1).splitlines():
        if line.startswith("  - "):
            if active_list is None:
                raise AssertionError(f"Unexpected frontmatter list item in {path}: {line!r}")
            active_list.append(parse_plain_frontmatter_scalar(line[4:], path))
            continue

        if active_list == []:
            raise AssertionError(f"Empty frontmatter list in {path}")
        active_list = None

        key_match = re.fullmatch(r"([^:]+):(?: (.*))?", line)
        if key_match is None:
            raise AssertionError(f"Invalid frontmatter entry in {path}: {line!r}")
        key, value = key_match.groups()
        if FRONTMATTER_KEY.fullmatch(key) is None:
            raise AssertionError(f"Invalid frontmatter key in {path}: {key!r}")
        if key in metadata:
            raise AssertionError(f"Duplicate frontmatter key in {path}: {key!r}")

        if value is not None:
            metadata[key] = parse_plain_frontmatter_scalar(value, path)
            active_list = None
        else:
            active_list = []
            metadata[key] = active_list

    if active_list == []:
        raise AssertionError(f"Empty frontmatter list in {path}")

    return metadata, match.group(2).strip()


class MarkdownAgentParserTest(unittest.TestCase):
    def parse(self, frontmatter: str) -> tuple[dict[str, object], str]:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "agent.md"
            path.write_text(f"---\n{frontmatter}\n---\nPrompt\n", encoding="utf-8")
            return parse_markdown_agent(path)

    def test_rejects_duplicate_frontmatter_keys(self):
        with self.assertRaisesRegex(AssertionError, "Duplicate frontmatter key"):
            self.parse("name: first\nname: second")

    def test_rejects_invalid_plain_scalar_colon_space(self):
        with self.assertRaisesRegex(AssertionError, "Invalid frontmatter scalar"):
            self.parse("description: invalid: scalar")

    def test_parses_the_supported_scalar_and_list_shape(self):
        metadata, prompt = self.parse(
            "name: example-agent\n"
            "description: Review an example.\n"
            "tools:\n"
            "  - Read\n"
            "  - Glob"
        )

        self.assertEqual(
            {
                "name": "example-agent",
                "description": "Review an example.",
                "tools": ["Read", "Glob"],
            },
            metadata,
        )
        self.assertEqual("Prompt", prompt)


class ReactVerticalSlicesContractTest(unittest.TestCase):
    def test_required_package_files_exist(self):
        expected = (
            ".claude-plugin/plugin.json",
            ".codex-plugin/plugin.json",
            "README.md",
            "agents/react-vertical-slices-reviewer.md",
            "agents/react-vertical-slices-migrator.md",
            "agents/react_vertical_slices_reviewer.toml",
            "agents/react_vertical_slices_migrator.toml",
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
            self.assertEqual("0.2.0", manifest["version"])
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

    def test_codex_metadata_requires_explicit_invocation(self):
        metadata = (SKILL_ROOT / "agents" / "openai.yaml").read_text(
            encoding="utf-8"
        )

        self.assertIn('display_name: "React Vertical Slices"', metadata)
        self.assertIn("$react-vertical-slices", metadata)
        self.assertIn("allow_implicit_invocation: false", metadata)
        self.assertNotIn("dependencies:", metadata)

    def test_skill_declares_explicit_invocation_scope(self):
        skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
        normalized = " ".join(skill.lower().split())

        self.assertIn("## Invocation scope", skill)
        self.assertIn("$react-vertical-slices", skill)
        self.assertIn("user explicitly", normalized)
        self.assertRegex(normalized, r"applicable\s+`?agents\.md`?")
        self.assertIn("adopt", normalized)
        self.assertIn("unrelated react work", normalized)
        self.assertIn("do not infer", normalized)

    def test_agent_templates_are_portable_and_have_unique_names(self):
        parsed_agents = []
        for path in AGENT_PATHS:
            with path.open("rb") as agent_file:
                agent = tomllib.load(agent_file)

            self.assertTrue(path.is_file())
            self.assertFalse(path.is_symlink())
            self.assertTrue({"name", "description", "developer_instructions"} <= agent.keys())
            self.assertNotIn("model", agent)
            self.assertNotIn("model_reasoning_effort", agent)
            self.assertIsInstance(agent["developer_instructions"], str)
            self.assertIn("\n", agent["developer_instructions"])
            self.assertIn("AGENTS.md", agent["developer_instructions"])
            self.assertIn("$react-vertical-slices", agent["developer_instructions"])
            self.assertIn("unavailable", agent["developer_instructions"].lower())
            instructions = " ".join(agent["developer_instructions"].lower().split())
            self.assertIn("invoke $react-vertical-slices", instructions)
            self.assertIn("read and follow $react-vertical-slices", instructions)
            parsed_agents.append(agent)

        self.assertEqual(len(parsed_agents), len({agent["name"] for agent in parsed_agents}))
        self.assertEqual(
            {"react_vertical_slices_reviewer", "react_vertical_slices_migrator"},
            {agent["name"] for agent in parsed_agents},
        )

    def test_claude_agents_use_native_names_tools_and_shared_skill(self):
        reviewer, reviewer_prompt = parse_markdown_agent(CLAUDE_AGENT_PATHS[0])
        migrator, migrator_prompt = parse_markdown_agent(CLAUDE_AGENT_PATHS[1])

        self.assertEqual("react-vertical-slices-reviewer", reviewer["name"])
        self.assertEqual("react-vertical-slices-migrator", migrator["name"])
        self.assertNotIn("model", reviewer)
        self.assertNotIn("model", migrator)
        self.assertEqual(["react-vertical-slices"], reviewer["skills"])
        self.assertEqual(["react-vertical-slices"], migrator["skills"])
        self.assertEqual(["Read", "Grep", "Glob"], reviewer["tools"])
        self.assertEqual(
            ["Read", "Grep", "Glob", "Write", "Edit", "Bash"],
            migrator["tools"],
        )
        self.assertIn("approved architecture plan", migrator_prompt.lower())
        self.assertIn("changes_required", reviewer_prompt.lower())

    def test_claude_agents_are_portable_and_match_codex_behavior_contracts(self):
        reviewer, reviewer_prompt = parse_markdown_agent(CLAUDE_AGENT_PATHS[0])
        migrator, migrator_prompt = parse_markdown_agent(CLAUDE_AGENT_PATHS[1])

        for path, metadata, prompt in (
            (CLAUDE_AGENT_PATHS[0], reviewer, reviewer_prompt),
            (CLAUDE_AGENT_PATHS[1], migrator, migrator_prompt),
        ):
            self.assertTrue(path.is_file())
            self.assertFalse(path.is_symlink())
            self.assertEqual({"name", "description", "tools", "skills"}, metadata.keys())
            self.assertIsInstance(metadata["description"], str)
            self.assertTrue(prompt)
            self.assertIn("CLAUDE.md", prompt)
            self.assertIn("AGENTS.md", prompt)
            self.assertIn("preloaded `react-vertical-slices` skill", prompt)
            self.assertIn("unavailable", prompt.lower())

        reviewer_contract = reviewer_prompt.lower()
        for expected in (
            "plan-review",
            "implementation-review",
            "approved",
            "changes_required",
            "blocked",
            "blocking violations",
            "non-blocking improvements",
            "existing debt",
            "required corrections",
            "remaining risks",
            "read-only",
            "never approve your own exceptions",
        ):
            self.assertIn(expected, reviewer_contract)

        migrator_contract = " ".join(migrator_prompt.lower().split())
        for expected in (
            "explicit implementation request",
            "approved architecture plan",
            "target subtree",
            "approved boundaries",
            "expected public api",
            "behaviour constraints",
            "verification expectations",
            "one agreed migration unit",
            "preserve behaviour",
            "styling",
            "public contracts",
            "ambiguity",
            "conflict",
            "unapproved expansion",
            "changed areas",
            "verification",
            "remaining risks",
        ):
            self.assertIn(expected, migrator_contract)

    def test_agent_templates_have_no_external_integration_keys_or_urls(self):
        forbidden = re.compile(
            r"https?://|www\.|api[_ -]?key|(?:access|refresh|client)[_ -]?(?:token|secret|key|id)|bearer\s+|secret|webhook|mcp",
            re.IGNORECASE,
        )
        for external_detail in (
            "https://example.test",
            "www.example.test",
            "api_key=example",
            "Bearer example",
            "client_secret=example",
        ):
            self.assertIsNotNone(forbidden.search(external_detail))

        for path in ALL_AGENT_PATHS:
            text = path.read_text(encoding="utf-8")
            self.assertIsNone(forbidden.search(text), f"External integration detail found in {path}")

    def test_reviewer_template_is_read_only_and_has_review_contracts(self):
        with AGENT_PATHS[0].open("rb") as agent_file:
            reviewer = tomllib.load(agent_file)

        instructions = reviewer["developer_instructions"].lower()
        self.assertEqual("read-only", reviewer["sandbox_mode"])
        for expected in (
            "plan-review",
            "implementation-review",
            "approved",
            "changes_required",
            "blocked",
            "blocking violations",
            "non-blocking improvements",
            "existing debt",
            "required corrections",
            "remaining risks",
            "never edit",
            "own exceptions",
        ):
            self.assertIn(expected, instructions)

    def test_migrator_template_is_approval_gated_and_preserves_contracts(self):
        with AGENT_PATHS[1].open("rb") as agent_file:
            migrator = tomllib.load(agent_file)

        instructions = " ".join(
            migrator["developer_instructions"].lower().split()
        )
        self.assertEqual("workspace-write", migrator["sandbox_mode"])
        for expected in (
            "explicit implementation request",
            "approved architecture plan",
            "target subtree",
            "approved boundaries",
            "expected public api",
            "behaviour constraints",
            "verification expectations",
            "one agreed migration unit",
            "preserve behaviour",
            "styling",
            "public contracts",
            "ambiguity",
            "conflict",
            "unapproved expansion",
            "changed areas",
            "verification",
            "remaining risks",
        ):
            self.assertIn(expected, instructions)

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
            if path.is_file() and path.suffix in {".md", ".json", ".toml", ".yaml", ".py"}:
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
            if path.is_file() and path.suffix in {".md", ".json", ".toml", ".yaml"}
        )
        self.assertNotIn("[" + "TODO:", text)
        self.assertNotIn("T" + "BD", text)

    def test_package_contains_no_symlinks(self):
        symlinks = [path for path in PACKAGE_ROOT.rglob("*") if path.is_symlink()]

        self.assertEqual([], symlinks)

    def test_readme_documents_both_clients_and_portable_installation(self):
        readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")

        for expected in (
            "$react-vertical-slices",
            "/react-vertical-slices:react-vertical-slices",
            "~/.agents/skills/react-vertical-slices",
            "~/.claude/skills/react-vertical-slices",
            "claude --plugin-dir",
            "claude plugin validate",
            ".codex/agents",
            "not automatically installed",
            "independent",
            "AGENTS.md",
            "adopted",
            "unrelated React work",
            "automatic delegation",
            "react_vertical_slices_reviewer",
            "react_vertical_slices_migrator",
            "explicit and approval-gated",
        ):
            self.assertIn(expected, readme)

    def test_agent_behavior_scenarios_and_results_cover_required_cases(self):
        scenarios = (PACKAGE_ROOT / "tests" / "behavior-scenarios.md").read_text(
            encoding="utf-8"
        ).lower()
        results = (PACKAGE_ROOT / "tests" / "behavior-results.md").read_text(
            encoding="utf-8"
        )
        normalized_results = results.lower()

        required_scenarios = {
            "vs-11": ("deep import", "type-only import", "second use"),
            "vs-12": ("repository conflict", "blocked"),
            "vs-13": ("approved", "does not invent required corrections"),
            "vs-14": ("read-only", "refuses to edit"),
            "vs-15": ("existing debt", "required corrections"),
            "vs-16": ("explicit implementation request", "approved architecture plan"),
            "vs-17": ("one agreed", "independently verifiable"),
            "vs-18": ("behaviour", "styling", "public api"),
            "vs-19": ("ambiguity", "conflict", "unapproved expansion"),
            "vs-20": ("unrelated debt", "does not fix"),
            "vs-21": ("actually runs", "remaining risks"),
            "vs-22": ("plugin discovery", "scoped invocation"),
            "vs-23": ("read", "grep", "glob", "refuses to edit"),
            "vs-24": ("approved architecture plan", "makes no file changes"),
        }

        scenario_sections = {}
        for scenario_id in required_scenarios:
            section_match = re.search(
                rf"^## {scenario_id}:.*?(?=^## |\Z)",
                scenarios,
                re.MULTILINE | re.DOTALL,
            )
            self.assertIsNotNone(section_match, f"Missing scenario section {scenario_id}")
            scenario_sections[scenario_id] = section_match.group(0)

        for scenario_id, expected_outcomes in required_scenarios.items():
            self.assertIn(scenario_id, normalized_results, expected_outcomes)
            for expected in expected_outcomes:
                self.assertIn(
                    expected,
                    scenario_sections[scenario_id],
                    f"Missing {expected!r} in {scenario_id}",
                )

        allowed_statuses = ("Pass", "Fail", "Pending")
        for scenario_id in required_scenarios:
            row_pattern = re.compile(
                rf"^\| {scenario_id.upper()} \| ({'|'.join(allowed_statuses)}) \|[^\n]+$",
                re.MULTILINE,
            )
            self.assertIsNone(row_pattern.search(""))
            self.assertIsNone(
                row_pattern.search(f"| {scenario_id.upper()} | Unknown | fabricated |")
            )
            row_matches = list(row_pattern.finditer(results))
            self.assertEqual(1, len(row_matches), f"Missing or duplicate result row for {scenario_id}")
            row_match = row_matches[0]
            self.assertIn(row_match.group(1), allowed_statuses)
            self.assertNotIn("not run", row_match.group(0).lower(), f"Explain the limitation for {scenario_id}")


if __name__ == "__main__":
    unittest.main()
