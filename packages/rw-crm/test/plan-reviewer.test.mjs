import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewPlan } from '../src/planning/plan-reviewer.mjs';
import { createContextSnapshot } from '../src/context/context-snapshot.mjs';

const completePlan = { id: 'p1', goal: 'Add DatePicker', scope: {}, files: ['a'], interfaces: ['DatePicker API'], risks: [], verification: ['unit'], libraryDecisions: [], approvalStatus: 'awaiting-approval' };
const context = { gaps: [], ambiguities: [], libraryDecisions: [] };

test('approves a complete plan without mutating it', async () => {
  const original = structuredClone(completePlan);
  const result = await reviewPlan({ request: { task: 'Add DatePicker' }, initialPlan: completePlan }, { contextAdapter: { async discover() { return context; } }, checklist: [], ledger: { async consult() { return []; } } });
  assert.equal(result.recommendation, 'approve');
  assert.deepEqual(result.reviewedPlan, original);
  assert.deepEqual(completePlan, original);
});

test('blocks missing context and flags library conflicts and missing verification', async () => {
  const result = await reviewPlan({ request: { task: 'Add DatePicker' }, initialPlan: { ...completePlan, verification: [], libraryDecisions: [{ figma: '8px', library: '4px', authority: 'ui-library' }] } }, {
    contextAdapter: { async discover() { return { gaps: [{ reason: 'missing code' }], ambiguities: [], libraryDecisions: [] }; } }, checklist: [], ledger: { async consult() { return []; } }
  });
  assert.equal(result.recommendation, 'blocked');
  assert.ok(result.findings.some((finding) => finding.category === 'context' && finding.blocking));
  assert.ok(result.findings.some((finding) => finding.category === 'library-decision'));
  assert.ok(result.findings.some((finding) => finding.category === 'verification'));
});

test('uses a supplied context snapshot without rediscovering context', async () => {
  const contextSnapshot = createContextSnapshot({
    taskId: 'Add DatePicker',
    now: '2026-08-28T10:00:00.000Z',
    context: {
      selectedSources: [],
      scope: { components: ['DatePicker'], screens: [], routes: [] },
      libraryDecisions: [{ topic: 'radius', figma: '8px', library: '4px', authority: 'ui-library' }],
      gaps: [],
      ambiguities: []
    }
  });
  const result = await reviewPlan({
    request: { task: 'Add DatePicker' },
    initialPlan: { ...completePlan, libraryDecisions: [] },
    contextSnapshot
  }, {
    contextAdapter: { async discover() { throw new Error('supplied snapshot must not trigger discovery'); } },
    checklist: [],
    ledger: { async consult(_request, context) { assert.equal(context, contextSnapshot); return []; } }
  });

  assert.equal(result.recommendation, 'approve');
  assert.ok(result.findings.some((finding) => finding.category === 'library-decision'));
});

test('treats an empty supplied snapshot decision list as authoritative', async () => {
  const contextSnapshot = createContextSnapshot({
    taskId: 'Add DatePicker',
    now: '2026-08-28T10:00:00.000Z',
    context: {
      selectedSources: [],
      scope: { components: ['DatePicker'], screens: [], routes: [] },
      libraryDecisions: [],
      gaps: [],
      ambiguities: []
    }
  });
  const result = await reviewPlan({
    request: { task: 'Add DatePicker' },
    initialPlan: {
      ...completePlan,
      libraryDecisions: [{ topic: 'radius', figma: '8px', library: '4px', authority: 'ui-library' }]
    },
    contextSnapshot
  }, {
    contextAdapter: { async discover() { throw new Error('supplied snapshot must not trigger discovery'); } },
    checklist: [],
    ledger: { async consult() { return []; } }
  });

  assert.equal(result.recommendation, 'approve');
  assert.equal(result.findings.some((finding) => finding.category === 'library-decision'), false);
});
