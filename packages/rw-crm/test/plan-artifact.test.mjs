import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanArtifact } from '../src/planning/plan-artifact.mjs';

const digest = 'a'.repeat(64);
const basePlan = {
  id: 'plan:Add Date Picker',
  goal: 'Add Date Picker',
  scope: { components: ['DatePicker'], screens: ['Listing'], routes: [] },
  files: ['libs/ui/datepicker.tsx'],
  interfaces: ['DatePicker public component API'],
  libraryDecisions: [{ authority: 'ui-library', decision: 'Use the shared radius token' }],
  risks: [{ type: 'missing-context', reason: 'Mobile layout unavailable' }],
  verification: ['jest DatePicker.test.tsx', 'accessibility checks'],
  questions: ['Should keyboard navigation wrap?'],
  approvalStatus: 'awaiting-approval',
  planHash: digest,
  approval: { approvedBy: 'Pol', planHash: digest },
  sourceBodies: ['secret source body'],
  credentials: ['secret-token']
};

test('creates a readable ticket-based Markdown artifact', () => {
  const artifact = createPlanArtifact({
    plan: basePlan,
    task: 'Add Date Picker',
    ticketKey: 'CRM-123',
    revision: 1
  });

  assert.deepEqual({
    kind: artifact.kind,
    title: artifact.title,
    filename: artifact.filename,
    mediaType: artifact.mediaType,
    revision: artifact.revision,
    planId: artifact.planId
  }, {
    kind: 'implementation-plan',
    title: 'CRM-123 — Add Date Picker — Plan v1',
    filename: 'CRM-123-add-date-picker-plan-v1.md',
    mediaType: 'text/markdown',
    revision: 1,
    planId: 'plan:Add Date Picker'
  });

  for (const heading of [
    '# CRM-123 — Add Date Picker — Plan v1',
    '## Goal',
    '## Scope',
    '## Affected Files',
    '## Interfaces',
    '## Library Decisions',
    '## Risks and Context Gaps',
    '## Verification',
    '## Open Questions',
    '## Approval Status'
  ]) assert.ok(artifact.content.includes(heading), heading);
});

test('uses a safe fallback filename for missing or unusable task text', () => {
  const artifact = createPlanArtifact({ plan: { ...basePlan, goal: '***' }, task: '///', revision: 1 });
  assert.equal(artifact.filename, 'rw-crm-task-plan-v1.md');
  assert.equal(artifact.title, '*** — Plan v1');
});

test('normalizes unsafe characters and limits the task slug to 80 characters', () => {
  const task = `${'Ä unsafe / task ? '.repeat(12)}tail`;
  const artifact = createPlanArtifact({ plan: { ...basePlan, goal: task }, task, ticketKey: 'CRM-123', revision: 2 });
  const slug = artifact.filename.slice('CRM-123-'.length, -'-plan-v2.md'.length);
  assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(slug.length <= 80);
  assert.equal(artifact.revision, 2);
});

test('rejects non-positive and non-integer revisions', () => {
  for (const revision of [0, -1, 1.5, '2', null]) {
    assert.throws(() => createPlanArtifact({ plan: basePlan, task: basePlan.goal, revision }), /revision must be a positive integer/);
  }
});

test('omits hashes, source bodies, credentials, and approval receipt data', () => {
  const artifact = createPlanArtifact({ plan: basePlan, task: basePlan.goal, revision: 1 });
  const visible = `${artifact.title}\n${artifact.filename}\n${artifact.content}`;
  assert.doesNotMatch(visible, /planHash/);
  assert.doesNotMatch(visible, /[a-f0-9]{64}/);
  assert.doesNotMatch(visible, /secret source body|secret-token|approvedBy/);

  const digestTask = createPlanArtifact({ plan: { ...basePlan, goal: digest }, task: digest, revision: 1 });
  assert.doesNotMatch(`${digestTask.title}\n${digestTask.filename}\n${digestTask.content}`, /[a-f0-9]{64}/);
  assert.equal(digestTask.filename, 'rw-crm-task-plan-v1.md');
});

test('ignores an invalid ticket key instead of putting it in the filename', () => {
  const artifact = createPlanArtifact({ plan: basePlan, task: basePlan.goal, ticketKey: '../../CRM-123', revision: 1 });
  assert.equal(artifact.filename, 'rw-crm-add-date-picker-plan-v1.md');
});

test('creates distinct readable artifacts for every material revision', () => {
  const v1 = createPlanArtifact({ plan: basePlan, task: basePlan.goal, revision: 1 });
  const v2 = createPlanArtifact({ plan: { ...basePlan, files: [...basePlan.files, 'libs/ui/datepicker.test.tsx'] }, task: basePlan.goal, revision: 2 });
  const v3 = createPlanArtifact({ plan: { ...basePlan, verification: [...basePlan.verification, 'visual checks'] }, task: basePlan.goal, revision: 3 });
  assert.deepEqual([v1.filename, v2.filename, v3.filename], [
    'rw-crm-add-date-picker-plan-v1.md',
    'rw-crm-add-date-picker-plan-v2.md',
    'rw-crm-add-date-picker-plan-v3.md'
  ]);
  assert.match(v2.content, /datepicker\.test\.tsx/);
  assert.match(v3.content, /visual checks/);
  assert.doesNotMatch(v1.content, /datepicker\.test\.tsx|visual checks/);
});
