import type { Result } from "../domain/diagnostic.js";
import type { LocalRepository } from "../local/path-policy.js";
import { resolveLocalRepository } from "../local/path-policy.js";
import {
  updateIndex,
  type UpdateIndexSummary,
} from "../indexer/incremental.js";
import {
  installProjectSkill,
  type SkillChange,
} from "../skill/install.js";

export interface ConnectSummary {
  repository: LocalRepository;
  index: UpdateIndexSummary;
  skill: SkillChange;
  reused: boolean;
}

export async function connectRepository(
  inputPath: string,
  cwd: string,
): Promise<Result<ConnectSummary>> {
  const repository = await resolveLocalRepository(inputPath, cwd);
  if (!repository.ok) return repository;

  const skill = await installProjectSkill(repository.value);
  if (!skill.ok) return skill;

  const index = await updateIndex(repository.value.root, {
    format: "json",
    cwd,
  });
  if (!index.ok) return index;

  return {
    ok: true,
    value: {
      repository: repository.value,
      index: index.value,
      skill: skill.value,
      reused: index.value.reused,
    },
    diagnostics: [...index.diagnostics, ...skill.diagnostics],
  };
}
