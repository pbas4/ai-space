from pathlib import Path
import unittest


SKILL_PATH = Path(__file__).parents[1] / "skills" / "create-task-plan" / "SKILL.md"
METADATA_PATH = Path(__file__).parents[1] / "skills" / "create-task-plan" / "agents" / "openai.yaml"


class CreateTaskPlanSkillContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = SKILL_PATH.read_text(encoding="utf-8")
        cls.metadata = METADATA_PATH.read_text(encoding="utf-8")

    def test_requires_explicit_manual_invocation(self):
        self.assertIn("allow_implicit_invocation: false", self.metadata)

    def test_replaces_brainstorming_with_rw_ui_planner_for_ui_tasks(self):
        self.assertNotIn("superpowers:brainstorming", self.skill)
        self.assertNotIn("discover the independently installed RW CRM Components Engineer", self.skill)
        self.assertIn("rw-crm:rw-crm-components-planner", self.skill)
        self.assertIn("read-only initial implementation plan", self.skill)
        self.assertIn("For a non-UI issue, do not invoke the RW UI Components Planner", self.skill)
        self.assertIn("Continue with the separate non-UI planning workflow", self.skill)

    def test_prefers_structured_prompts_with_single_question_fallback(self):
        self.assertIn("structured-choice prompt", self.skill)
        self.assertIn("ask exactly one question at a time", self.skill)
        self.assertIn("only when structured choices are unavailable", self.skill)

    def test_requires_direct_jest_and_prohibits_nx_for_target_verification(self):
        self.assertIn("run the narrowest relevant Jest command directly", self.skill)
        self.assertIn("Never invoke Nx directly", self.skill)
        self.assertIn("Nx-wrapped package script", self.skill)

    def test_requires_fast_forward_main_update_before_branching(self):
        self.assertIn("git pull --ff-only", self.skill)
        self.assertIn("clean `main`", self.skill)
        self.assertIn("Never stash, reset, force-pull, or rebase automatically", self.skill)

    def test_protects_main_and_master_from_writes(self):
        self.assertIn(
            "The only permitted write to `main` is the initial `git pull --ff-only` "
            "fast-forward update while local `main` and the worktree are clean",
            self.skill,
        )
        self.assertIn(
            "Never make task changes, commit, merge, rebase, reset, use force operations, "
            "or perform any other write on `main` or `master`",
            self.skill,
        )

    def test_limits_jira_writes_to_an_approved_subtask_batch(self):
        self.assertIn("explicitly approves the full subtask batch", self.skill)
        self.assertIn("create-subtask capability", self.skill)
        self.assertIn("Do not comment, transition, edit, or otherwise modify existing Jira issues", self.skill)

    def test_requires_checkpoint_commit_authorization(self):
        self.assertIn("Commit this checkpoint", self.skill)
        self.assertIn("Allow commits for the rest of this parent-task run", self.skill)
        self.assertIn("Do not commit now", self.skill)
        self.assertIn("Wait for the user's selection", self.skill)
        self.assertIn(
            "Commit only after the user selects `Commit this checkpoint` or while "
            "`Allow commits for the rest of this parent-task run` authorization is active",
            self.skill,
        )
        self.assertIn("Otherwise, do not commit", self.skill)

    def test_requires_separate_push_and_pull_request_approval(self):
        self.assertIn(
            "Commit authorization never authorizes a push or pull-request creation",
            self.skill,
        )
        self.assertIn(
            "Before any push or pull-request creation, wait for separate, explicit user approval",
            self.skill,
        )
        self.assertIn("Never push directly to `main` or `master`", self.skill)

    def test_requires_predecessors_on_main_before_dependent_subtasks(self):
        self.assertIn("Before starting a dependent subtask", self.skill)
        self.assertIn(
            "every predecessor commit required by its plan is an ancestor of clean, updated `main`",
            self.skill,
        )
        self.assertIn("external integration is required", self.skill)
        self.assertIn(
            "Never merge, rebase, cherry-pick, or otherwise integrate predecessor work yourself",
            self.skill,
        )

    def test_reserves_task_prefix_for_plugin_created_approved_subtasks(self):
        self.assertIn(
            "Treat every original Jira issue as a parent issue, including an issue whose Jira type is `Task`",
            self.skill,
        )
        self.assertIn(
            "Propose `feature/<JIRA-KEY>-<normalized-title>` for every parent issue",
            self.skill,
        )
        self.assertIn(
            "Propose `fix/<JIRA-KEY>-<normalized-title>` only for a Jira Bug or Defect",
            self.skill,
        )
        self.assertIn(
            "Reserve `task/<JIRA-KEY>-<normalized-title>` exclusively for a Jira subtask",
            self.skill,
        )
        self.assertIn(
            "that this plugin created after the user explicitly approved the complete Jira-subtask creation batch",
            self.skill,
        )
        self.assertIn("Do not use `task/` for an original Jira issue", self.skill)

    def test_requires_branch_name_approval_before_branch_changing_git_actions(self):
        self.assertIn(
            "before any `git switch`, `git checkout`, branch creation, or other branch-changing Git command",
            self.skill,
        )
        self.assertIn("the exact proposed branch name and the reason for its prefix", self.skill)
        self.assertIn("Approve this branch name", self.skill)
        self.assertIn("Edit the branch name", self.skill)
        self.assertIn("Do not create or check out a branch", self.skill)
        self.assertIn(
            "show the final exact name for a second explicit approval before changing branches",
            self.skill,
        )
        self.assertIn(
            "planning and read-only analysis may continue, but the plugin must block implementation and commits",
            self.skill,
        )
        self.assertIn(
            "offering to use the existing branch, edit the name, or cancel",
            self.skill,
        )

    def test_rejects_taxonomy_bypasses_and_protected_branch_selection(self):
        self.assertIn(
            "An edited branch name must retain the approved prefix for the item's classification",
            self.skill,
        )
        self.assertIn(
            "reject the edit and ask for another name or cancellation",
            self.skill,
        )
        self.assertIn(
            "Never propose, use, or check out `main` or `master` as a task branch",
            self.skill,
        )
        self.assertIn(
            "Do not offer an existing protected branch as a conflict-resolution choice",
            self.skill,
        )
        self.assertNotIn("all other issue types to `task`", self.skill)

    def test_routes_figma_and_component_library_work_to_rw_ui_planner(self):
        self.assertIn("Classify the retrieved Jira issue before repository analysis or planning", self.skill)
        self.assertIn("a Figma URL or design reference", self.skill)
        self.assertIn("explicitly identifies a CRM UI-library component", self.skill)
        self.assertIn("discover the installed `rw-crm:rw-crm-components-planner`", self.skill)
        self.assertIn("every detected Figma URL or design reference", self.skill)
        self.assertIn("Do not invoke the RW CRM Components Engineer or any implementation agent during planning", self.skill)

    def test_uses_the_shared_three_way_ui_routing_policy(self):
        self.assertIn("`ui-related`", self.skill)
        self.assertIn("`possible-ui`", self.skill)
        self.assertIn("`non-ui`", self.skill)
        self.assertIn("auto-invoke the RW CRM Components Planner only for `ui-related`", self.skill)
        self.assertIn("For `possible-ui`, ask one structured-choice confirmation", self.skill)
        self.assertIn("classification evidence", self.skill)

    def test_preserves_non_ui_flow_and_surfaces_ui_planner_findings(self):
        self.assertIn("For a non-UI issue, do not invoke the RW UI Components Planner", self.skill)
        self.assertIn("Continue with the separate non-UI planning workflow unchanged", self.skill)
        self.assertIn(
            "mandatory input to both the displayed gap analysis and the created implementation plan",
            self.skill,
        )
        self.assertIn("UI-context gap", self.skill)
        self.assertIn("continue the read-only planning workflow", self.skill)


if __name__ == "__main__":
    unittest.main()
