import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialPlan } from '../src/planning/components-planner.mjs';
import { createContextSnapshot } from '../src/context/context-snapshot.mjs';

test('creates a bounded read-only initial plan from context and ledger', async () => {
  const calls = [];
  const result = await createInitialPlan({ task: 'Add DatePicker', componentScope: ['DatePicker'] }, {
    contextAdapter: { async discover() { calls.push('context'); return { scope: { components: ['DatePicker'] }, sources: [], gaps: [], ambiguities: [], libraryDecisions: [{ authority: 'ui-library', decision: 'use library radius' }] }; } },
    ledger: { async consult() { calls.push('ledger'); return [{ lesson: 'Use library tokens', class: 'stable-rule' }]; } }
  });
  assert.deepEqual(calls, ['context', 'ledger']);
  assert.equal(result.plan.approvalStatus, 'awaiting-approval');
  assert.equal(result.plan.goal, 'Add DatePicker');
  assert.equal(result.plan.libraryDecisions[0].authority, 'ui-library');
  assert.match(result.plan.interfaces[0], /DatePicker/);
});

test('reports ambiguous context without attempting implementation', async () => {
  const result = await createInitialPlan({ task: 'Fix Button', componentScope: ['Button'] }, {
    contextAdapter: { async discover() { return { scope: {}, sources: [], gaps: [], ambiguities: [{ topic: 'Button' }], libraryDecisions: [] }; } },
    ledger: { async consult() { return []; } }
  });
  assert.equal(result.plan.approvalStatus, 'awaiting-approval');
  assert.equal(result.plan.risks[0].type, 'ambiguous-context');
});

test('uses a supplied context snapshot without rediscovering context', async () => {
  const contextSnapshot = createContextSnapshot({
    taskId: 'Add DatePicker',
    now: '2026-08-28T10:00:00.000Z',
    context: {
      selectedSources: [],
      scope: { components: ['LibraryDatePicker'], screens: [], routes: [] },
      libraryDecisions: [{ authority: 'ui-library', decision: 'use library radius' }],
      gaps: [],
      ambiguities: []
    }
  });
  const result = await createInitialPlan({
    request: { task: 'Add DatePicker', componentScope: ['DatePicker'] },
    contextSnapshot
  }, {
    contextAdapter: { async discover() { throw new Error('supplied snapshot must not trigger discovery'); } },
    ledger: { async consult(_request, context) { assert.equal(context, contextSnapshot); return []; } }
  });

  assert.equal(result.context, contextSnapshot);
  assert.equal(result.plan.goal, 'Add DatePicker');
  assert.deepEqual(result.plan.scope.components, ['LibraryDatePicker']);
  assert.deepEqual(result.plan.libraryDecisions, [{ authority: 'ui-library', decision: 'use library radius' }]);
});
