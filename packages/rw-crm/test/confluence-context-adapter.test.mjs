import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfluenceContextAdapter } from '../src/context/confluence-context-adapter.mjs';
import { compareContextSnapshots, createContextSnapshot } from '../src/context/context-snapshot.mjs';

test('indexes every descendant and fetches only relevant Confluence bodies', async () => {
  const fetched = [];
  const children = {
    '21790813': [{ id: 'forms', title: 'Forms', tags: ['Form'] }],
    forms: [{ id: 'datepicker', title: 'DatePicker conventions', tags: ['DatePicker'], version: 7 }],
    datepicker: []
  };
  const adapter = createConfluenceContextAdapter({
    listChildren: async (id) => children[id] ?? [],
    fetchPage: async (source) => {
      fetched.push(source.id);
      return { body: `${source.id} body` };
    }
  });

  const report = await adapter.discover({ componentScope: ['DatePicker'] });
  assert.deepEqual(report.index.map((source) => source.id), ['21790813', 'forms', 'datepicker']);
  assert.deepEqual(report.selectedSources.map((source) => source.id), ['datepicker']);
  assert.deepEqual(fetched, ['datepicker']);
  assert.deepEqual(report.gaps, []);
  assert.deepEqual({ ...report.selectedSources[0], bodyDigest: undefined }, {
    id: 'datepicker',
    title: 'DatePicker conventions',
    tags: ['DatePicker'],
    version: 7,
    parentId: 'forms',
    depth: 2,
    kind: 'confluence',
    isConfluenceRoot: false,
    uri: 'confluence://datepicker',
    freshness: 'fresh',
    body: 'datepicker body',
    pageId: 'datepicker',
    pageVersion: 7,
    bodyDigest: undefined,
    accessible: true,
    bodyUnavailable: false,
    lastSuccessfulRetrievalAt: null,
    refreshPolicy: 'on-demand'
  });
  assert.match(report.selectedSources[0].bodyDigest, /^[a-f0-9]{64}$/);
});

test('keeps inaccessible and unreadable descendants as explicit context gaps', async () => {
  const adapter = createConfluenceContextAdapter({
    listChildren: async (id) => id === '21790813'
      ? [{ id: 'blocked', title: 'Blocked', inaccessible: true }, { id: 'forms', title: 'Forms', tags: ['Form'] }]
      : [],
    fetchPage: async () => { throw new Error('body unavailable'); }
  });

  const report = await adapter.discover({ componentScope: ['Form'] });
  assert.deepEqual(report.selectedSources.map((source) => source.id), ['forms']);
  assert.deepEqual(report.gaps, [
    { sourceId: 'blocked', reason: 'inaccessible', impact: 'descendant body and children unavailable' },
    { sourceId: 'forms', reason: 'refresh-failed', impact: 'body unavailable' }
  ]);
  assert.deepEqual(report.selectedSources[0], {
    id: 'forms',
    title: 'Forms',
    tags: ['Form'],
    parentId: '21790813',
    depth: 1,
    kind: 'confluence',
    isConfluenceRoot: false,
    uri: 'confluence://forms',
    freshness: 'unknown',
    bodyUnavailable: true,
    accessible: false,
    pageId: 'forms',
    pageVersion: null,
    bodyDigest: null,
    refreshPolicy: 'on-demand'
  });
});

test('makes a changed selected Confluence page body material to a task snapshot', async () => {
  let body = 'first version';
  const adapter = createConfluenceContextAdapter({
    listChildren: async (id) => id === '21790813' ? [{ id: 'button', title: 'Button', tags: ['Button'], version: 1 }] : [],
    fetchPage: async () => ({ body })
  });
  const envelope = { componentScope: ['Button'] };
  const first = createContextSnapshot({ taskId: 'task:button', now: '2026-08-28T09:00:00.000Z', context: await adapter.discover(envelope) });
  body = 'second version';
  const next = createContextSnapshot({ taskId: 'task:button', now: '2026-08-28T10:00:00.000Z', context: await adapter.discover(envelope) });

  assert.deepEqual(compareContextSnapshots(first, next), {
    material: true,
    changes: [{ sourceId: 'button', type: 'body-changed' }]
  });
});

test('uses canonical serialization for Confluence body provenance', async () => {
  let body = { beta: 'second', alpha: 'first' };
  const adapter = createConfluenceContextAdapter({
    listChildren: async (id) => id === '21790813' ? [{ id: 'button', title: 'Button', tags: ['Button'], version: 1 }] : [],
    fetchPage: async () => ({ body })
  });
  const envelope = { componentScope: ['Button'] };
  const firstContext = await adapter.discover(envelope);
  const expected = createContextSnapshot({
    taskId: 'task:button',
    now: '2026-08-28T09:00:00.000Z',
    context: { ...firstContext, selectedSources: [{ ...firstContext.selectedSources[0], body }] }
  });

  assert.equal(firstContext.selectedSources[0].bodyDigest, expected.selectedSources[0].bodyDigest);

  body = { alpha: 'first', beta: 'second' };
  const nextContext = await adapter.discover(envelope);
  const next = createContextSnapshot({ taskId: 'task:button', now: '2026-08-28T10:00:00.000Z', context: nextContext });
  const first = createContextSnapshot({ taskId: 'task:button', now: '2026-08-28T09:00:00.000Z', context: firstContext });

  assert.deepEqual(compareContextSnapshots(first, next), { material: false, changes: [] });
});
