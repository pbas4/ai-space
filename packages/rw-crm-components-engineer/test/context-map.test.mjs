import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceIndex,
  discoverConfluenceTree,
  selectRelevantSources,
  refreshSources
} from '../src/context/context-map.mjs';

test('selects Figma, library, and CRM sources relevant to task scope', () => {
  const index = buildSourceIndex({
    figma: [{ id: 'figma:date-picker', kind: 'figma', uri: 'https://figma.com/date-picker', tags: ['DatePicker'] }],
    uiLibrary: [{ id: 'library:date-picker', kind: 'ui-library', uri: 'storybook://DatePicker', tags: ['DatePicker'] }],
    crmCode: [{ id: 'code:date-picker', kind: 'crm-code', uri: 'packages/ui/DatePicker.tsx', tags: ['DatePicker'] }],
    confluenceRoot: { id: 'confluence:21790813', kind: 'confluence', uri: 'https://rwnl.atlassian.net/wiki/pages/21790813', tags: ['frontend'] }
  });
  const report = selectRelevantSources({ componentScope: ['DatePicker'], figmaLinks: ['https://figma.com/date-picker'], repositoryScope: ['packages/ui'] }, index);
  assert.deepEqual(report.sources.map((source) => source.id), ['figma:date-picker', 'library:date-picker', 'code:date-picker', 'confluence:21790813']);
  assert.deepEqual(report.gaps, []);
});

test('recursively discovers every Confluence descendant and reports inaccessible pages', async () => {
  const children = {
    root: [{ id: 'child-1', title: 'Child 1' }, { id: 'child-2', title: 'Child 2' }],
    'child-1': [{ id: 'grandchild-1', title: 'Grandchild 1' }],
    'child-2': [{ id: 'blocked', title: 'Blocked', inaccessible: true }],
    'grandchild-1': []
  };
  const report = await discoverConfluenceTree('root', async (id) => children[id] ?? []);
  assert.deepEqual(report.pages.map((page) => page.id), ['root', 'child-1', 'grandchild-1', 'child-2']);
  assert.deepEqual(report.gaps, [{ sourceId: 'blocked', reason: 'inaccessible', impact: 'descendant body and children unavailable' }]);
});

test('refreshes only selected stale sources and reports fetch failures', async () => {
  const sources = [
    { id: 'stale', kind: 'figma', uri: 'figma://stale', freshness: 'stale' },
    { id: 'fresh', kind: 'crm-code', uri: 'file://fresh', freshness: 'fresh' }
  ];
  const refreshed = await refreshSources(sources, async (source) => {
    if (source.id === 'stale') return { body: 'updated' };
    throw new Error('must not fetch fresh source');
  });
  assert.equal(refreshed.sources[0].body, 'updated');
  assert.deepEqual(refreshed.gaps, []);
});
