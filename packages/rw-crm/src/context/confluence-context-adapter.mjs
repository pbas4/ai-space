import { buildSourceIndex, discoverConfluenceTree, refreshSources, selectRelevantSources } from './context-map.mjs';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../workflow/approval-gate.mjs';
import { compareContextSnapshots, createContextSnapshot } from './context-snapshot.mjs';

const DEFAULT_ROOT_ID = '21790813';

function createBodyDigest(body) {
  return typeof body === 'undefined'
    ? null
    : createHash('sha256').update(canonicalJson(body)).digest('hex');
}

function withProvenance(source) {
  return {
    ...source,
    pageId: source.pageId ?? String(source.id),
    pageVersion: source.pageVersion ?? source.version ?? null,
    bodyDigest: createBodyDigest(source.body)
  };
}

export function createConfluenceContextAdapter({ rootId = DEFAULT_ROOT_ID, listChildren, fetchPage }) {
  if (typeof listChildren !== 'function') throw new TypeError('listChildren must be a function');
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage must be a function');

  return {
    async discover(envelope) {
      const tree = await discoverConfluenceTree(rootId, listChildren);
      const index = buildSourceIndex({
        confluence: tree.pages.map((page) => ({
          ...page,
          kind: 'confluence',
          isConfluenceRoot: page.id === rootId,
          uri: page.uri ?? `confluence://${page.id}`,
          pageId: String(page.id),
          pageVersion: page.version ?? null
        }))
      });
      const selection = selectRelevantSources(envelope, index);
      const refreshed = await refreshSources(selection.sources, fetchPage);
      return {
        index,
        selectedSources: refreshed.sources.map(withProvenance),
        gaps: [...tree.gaps, ...refreshed.gaps],
        ambiguities: selection.ambiguities
      };
    },
    async refresh(snapshot) {
      const refreshed = await refreshSources(snapshot.selectedSources.map((source) => ({ ...source, freshness: 'stale' })), fetchPage);
      const context = {
        selectedSources: refreshed.sources.map(withProvenance),
        gaps: [...snapshot.gaps, ...refreshed.gaps],
        ambiguities: snapshot.ambiguities
      };
      const nextSnapshot = createContextSnapshot({ taskId: snapshot.taskId, context, now: new Date() });
      return { snapshot: nextSnapshot, comparison: compareContextSnapshots(snapshot, nextSnapshot) };
    }
  };
}

export { DEFAULT_ROOT_ID };
