import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  '.codex-plugin/plugin.json',
  'package.json',
  'agents/rw-crm-workflow.yaml', 'agents/rw-crm-components-planner.yaml', 'agents/rw-crm-plan-reviewer.yaml', 'agents/rw-crm-components-engineer.yaml', 'agents/rw-crm-ui-reviewer.yaml',
  'skills/rw-crm-workflow/SKILL.md', 'skills/rw-crm-components-planner/SKILL.md', 'skills/rw-crm-plan-reviewer/SKILL.md', 'skills/rw-crm-components-engineer/SKILL.md', 'skills/rw-crm-ui-reviewer/SKILL.md',
  'schemas/context-envelope.schema.json',
  'schemas/engineer-result.schema.json',
  'schemas/learning-ledger.schema.json',
  'schemas/initial-plan.schema.json', 'schemas/plan-review.schema.json', 'schemas/ui-review.schema.json', 'schemas/model-proposal.schema.json',
  'references/workflow.md',
  'references/rw-conventions.md',
  'references/create-task-plan-consumer-contract.md',
  'references/review-checklist.md', 'references/model-policy.md',
  'references/rw-components-versioning.md',
  'test/fixtures/new-component.json',
  'test/fixtures/bug-fix.json',
  'test/fixtures/feature-extension.json',
  'test/fixtures/figma-conflict.json',
  'test/fixtures/approved-correction.json',
  'test/fixtures/planner-task.json', 'test/fixtures/plan-review.json', 'test/fixtures/ui-review.json', 'test/fixtures/orchestration.json',
  'test/fixtures/plugin-flow.json', 'test/fixtures/model-escalation.json'
];

for (const relativePath of required) {
  await readFile(join(root, relativePath), 'utf8');
}

const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
if (manifest.name !== 'rw-crm') throw new Error('invalid plugin name');
console.log('RW CRM package contract: PASS');
