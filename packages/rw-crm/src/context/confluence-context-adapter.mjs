import { buildSourceIndex, discoverConfluenceTree, refreshSources, selectRelevantSources } from './context-map.mjs';

const DEFAULT_ROOT_ID = '21790813';

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
          uri: page.uri ?? `confluence://${page.id}`
        }))
      });
      const selection = selectRelevantSources(envelope, index);
      const refreshed = await refreshSources(selection.sources, fetchPage);
      return {
        index,
        selectedSources: refreshed.sources,
        gaps: [...tree.gaps, ...refreshed.gaps],
        ambiguities: selection.ambiguities
      };
    }
  };
}

export { DEFAULT_ROOT_ID };
