import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareContextSnapshots,
  createContextSnapshot,
  refreshContextSnapshot
} from '../src/context/context-snapshot.mjs';

const fixedNow = '2026-08-28T09:00:00.000Z';
const context = {
  selectedSources: [{
    id: 'library:button',
    kind: 'ui-library',
    uri: 'storybook://Button',
    body: 'v1',
    retrievedAt: '2026-08-28T08:00:00.000Z'
  }],
  gaps: [],
  ambiguities: []
};

test('creates immutable deterministic task snapshots without source bodies', () => {
  const first = createContextSnapshot({ taskId: 'task:1', now: fixedNow, context });
  const same = createContextSnapshot({ taskId: 'task:1', now: fixedNow, context });

  assert.equal(first.id, same.id);
  assert.equal(first.sourceDigest, same.sourceDigest);
  assert.equal(first.selectedSources[0].body, undefined);
  assert.match(first.selectedSources[0].bodyDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.selectedSources), true);
  assert.throws(() => { first.gaps.push({ reason: 'later' }); }, TypeError);
});

test('clones context gaps and ambiguities before freezing a snapshot', () => {
  const input = {
    ...context,
    gaps: [{ reason: 'body-unavailable', details: { sourceId: 'library:button' } }],
    ambiguities: [{ topic: 'Button', options: ['primary', 'secondary'] }]
  };

  const snapshot = createContextSnapshot({ taskId: 'task:1', now: fixedNow, context: input });

  assert.equal(Object.isFrozen(input.gaps[0]), false);
  assert.equal(Object.isFrozen(input.gaps[0].details), false);
  assert.equal(Object.isFrozen(input.ambiguities[0]), false);
  assert.equal(Object.isFrozen(input.ambiguities[0].options), false);
  assert.equal(Object.isFrozen(snapshot.gaps[0]), true);
  assert.equal(Object.isFrozen(snapshot.ambiguities[0]), true);
});

test('reports material source, gap, and ambiguity changes but ignores retrieval times', () => {
  const previous = createContextSnapshot({ taskId: 'task:1', now: fixedNow, context });
  const changedBody = {
    ...previous,
    selectedSources: [{ ...previous.selectedSources[0], bodyDigest: 'a'.repeat(64) }]
  };
  const retrievedLater = {
    ...previous,
    selectedSources: [{ ...previous.selectedSources[0], retrievedAt: '2026-08-28T10:00:00.000Z' }]
  };

  assert.deepEqual(compareContextSnapshots(previous, changedBody), {
    material: true,
    changes: [{ sourceId: 'library:button', type: 'body-changed' }]
  });
  assert.deepEqual(compareContextSnapshots(previous, retrievedLater), { material: false, changes: [] });
  assert.deepEqual(compareContextSnapshots(previous, { ...previous, gaps: [{ reason: 'body-unavailable' }] }), {
    material: true,
    changes: [{ type: 'gap-changed' }]
  });
  assert.deepEqual(compareContextSnapshots(previous, { ...previous, ambiguities: [{ topic: 'Button' }] }), {
    material: true,
    changes: [{ type: 'ambiguity-changed' }]
  });
});

test('treats replacement gap and ambiguity content as material', () => {
  const previous = createContextSnapshot({
    taskId: 'task:1',
    now: fixedNow,
    context: {
      ...context,
      gaps: [{ reason: 'body-unavailable', sourceId: 'library:button' }],
      ambiguities: [{ topic: 'Button', options: ['primary'] }]
    }
  });
  const next = {
    ...previous,
    gaps: [{ reason: 'permission-denied', sourceId: 'library:button' }],
    ambiguities: [{ topic: 'Button', options: ['secondary'] }]
  };

  assert.deepEqual(compareContextSnapshots(previous, next), {
    material: true,
    changes: [{ type: 'gap-changed' }, { type: 'ambiguity-changed' }]
  });
});

test('refreshes through the host adapter and compares the new snapshot', async () => {
  const previous = createContextSnapshot({ taskId: 'task:1', now: fixedNow, context });
  const calls = [];
  const result = await refreshContextSnapshot(previous, {
    async refresh(snapshot, policy) {
      calls.push({ snapshot, policy });
      return {
        selectedSources: [{ ...context.selectedSources[0], body: 'v2' }],
        gaps: [],
        ambiguities: []
      };
    }
  }, { mode: 'on-demand' }, '2026-08-28T10:00:00.000Z');

  assert.equal(calls.length, 1);
  assert.equal(result.snapshot.taskId, 'task:1');
  assert.deepEqual(result.comparison.changes, [{ sourceId: 'library:button', type: 'body-changed' }]);
});
