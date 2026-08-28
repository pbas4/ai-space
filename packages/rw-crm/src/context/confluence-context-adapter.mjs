import { buildSourceIndex, discoverConfluenceTree, refreshSources, selectRelevantSources } from './context-map.mjs';
import { createHash } from 'node:crypto';

const DEFAULT_ROOT_ID = '21790813';

function createBodyDigest(body) {
  return typeof body === 'undefined'
    ? null
    : createHash('sha256').update(JSON.stringify(body)).digest('hex');
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
        selectedSources: refreshed.sources.map((source) => ({
          ...source,
          pageId: source.pageId ?? String(source.id),
          pageVersion: source.pageVersion ?? source.version ?? null,
          bodyDigest: createBodyDigest(source.body)
        })),
        gaps: [...tree.gaps, ...refreshed.gaps],
        ambiguities: selection.ambiguities
      };
    }
  };
}

export { DEFAULT_ROOT_ID };
