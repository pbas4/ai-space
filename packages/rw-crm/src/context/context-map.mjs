function normalize(source, defaults = {}) {
  return {
    ...defaults,
    ...source,
    tags: [...(source.tags ?? [])],
    freshness: source.freshness ?? 'unknown',
    refreshPolicy: source.refreshPolicy ?? 'on-demand'
  };
}

export function buildSourceIndex({ figma = [], uiLibrary = [], crmCode = [], confluence = [], confluenceRoot = null }) {
  const confluenceSources = confluence.length
    ? confluence
    : confluenceRoot
      ? [{ ...confluenceRoot, isConfluenceRoot: true }]
      : [];
  return [
    ...figma.map((source) => normalize(source, { kind: 'figma' })),
    ...uiLibrary.map((source) => normalize(source, { kind: 'ui-library' })),
    ...crmCode.map((source) => normalize(source, { kind: 'crm-code' })),
    ...confluenceSources.map((source) => normalize(source, { kind: 'confluence' }))
  ];
}

export async function discoverConfluenceTree(rootId, listChildren) {
  const pages = [{ id: rootId, parentId: null, depth: 0 }];
  const gaps = [];
  const visited = new Set([rootId]);

  async function visit(parentId, depth) {
    let children;
    try {
      children = await listChildren(parentId);
    } catch (error) {
      gaps.push({ sourceId: parentId, reason: 'child-discovery-failed', impact: error.message });
      return;
    }
    for (const child of children) {
      if (child.inaccessible) {
        gaps.push({ sourceId: child.id, reason: 'inaccessible', impact: 'descendant body and children unavailable' });
        continue;
      }
      if (visited.has(child.id)) {
        gaps.push({ sourceId: child.id, reason: 'cycle', impact: 'cyclic descendant skipped' });
        continue;
      }
      visited.add(child.id);
      pages.push({ ...child, parentId, depth });
      await visit(child.id, depth + 1);
    }
  }

  await visit(rootId, 1);
  return { pages, gaps };
}

function matches(source, envelope) {
  const scope = [...(envelope.componentScope ?? []), ...(envelope.repositoryScope ?? [])].map(String);
  const haystack = [source.id, source.uri, source.title, ...(source.tags ?? [])].filter(Boolean).join(' ').toLowerCase();
  const scopeMatch = scope.some((value) => haystack.includes(value.toLowerCase()));
  const figmaMatch = (envelope.figmaLinks ?? []).some((link) => source.uri === link || source.uri.includes(link));
  return scopeMatch || figmaMatch;
}

export function selectRelevantSources(envelope, index) {
  const matchingSources = index.filter((source) => matches(source, envelope));
  const matchingConfluence = matchingSources.filter((source) => source.kind === 'confluence');
  const fallbackConfluence = !matchingConfluence.length
    ? index.find((source) => source.kind === 'confluence' && source.isConfluenceRoot)
    : null;
  const sources = fallbackConfluence ? [...matchingSources, fallbackConfluence] : matchingSources;
  const gaps = [];
  const ambiguities = [];
  for (const kind of ['figma', 'ui-library', 'crm-code']) {
    if ((envelope.componentScope?.length || envelope.repositoryScope?.length) && !sources.some((source) => source.kind === kind)) {
      gaps.push({ reason: `no relevant ${kind} source`, impact: `${kind} comparison is unavailable` });
    }
  }
  const byTopic = new Map();
  for (const source of sources) {
    const topic = source.tags?.find((tag) => envelope.componentScope?.includes(tag));
    if (topic) byTopic.set(topic, [...(byTopic.get(topic) ?? []), source]);
  }
  for (const [topic, candidates] of byTopic) {
    if (candidates.length > 3) ambiguities.push({ topic, candidates: candidates.map((source) => source.id), decisionRequired: 'choose the applicable source' });
  }
  return { sources, gaps, ambiguities };
}

export async function refreshSources(sources, fetchSource) {
  const refreshed = [];
  const gaps = [];
  for (const source of sources) {
    if (source.freshness !== 'stale' && source.freshness !== 'unknown') {
      refreshed.push(source);
      continue;
    }
    try {
      refreshed.push({ ...source, ...(await fetchSource(source)), freshness: 'fresh' });
    } catch (error) {
      refreshed.push(source);
      gaps.push({ sourceId: source.id, reason: 'refresh-failed', impact: error.message });
    }
  }
  return { sources: refreshed, gaps };
}
