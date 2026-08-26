import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfluenceContextAdapter } from '../src/context/confluence-context-adapter.mjs';

test('indexes every descendant and fetches only relevant Confluence bodies', async () => {
  const fetched = [];
  const children = {
    '21790813': [{ id: 'forms', title: 'Forms', tags: ['Form'] }],
    forms: [{ id: 'datepicker', title: 'DatePicker conventions', tags: ['DatePicker'] }],
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
});
