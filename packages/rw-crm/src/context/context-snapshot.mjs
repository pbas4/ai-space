import { createHash } from 'node:crypto';
import { validateWithSchema } from '../contracts.mjs';
import { canonicalJson } from '../workflow/approval-gate.mjs';

function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function toIsoTimestamp(value, name) {
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    throw new TypeError(`${name} must be an ISO-8601 timestamp`);
  }
  return timestamp;
}

function snapshotSource(source) {
  const bodyDigest = typeof source.body === 'undefined'
    ? (source.bodyDigest ?? null)
    : digest(source.body);
  return {
    id: source.id,
    kind: source.kind,
    uri: source.uri,
    pageId: source.pageId ?? null,
    pageVersion: source.pageVersion ?? null,
    bodyDigest,
    accessible: source.accessible ?? !source.bodyUnavailable,
    lastSuccessfulRetrievalAt: source.lastSuccessfulRetrievalAt ?? source.retrievedAt ?? null
  };
}

function snapshotScope(scope) {
  return JSON.parse(canonicalJson(scope ?? { components: [], screens: [], routes: [] }));
}

function snapshotLibraryDecisions(libraryDecisions) {
  return JSON.parse(canonicalJson(libraryDecisions ?? []));
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function assertSnapshot(value) {
  const validation = validateWithSchema('context-snapshot', value);
  if (!validation.valid) throw new TypeError(`invalid context snapshot: ${validation.errors.join('; ')}`);
  return freeze(value);
}

export function createContextSnapshot({ taskId, context, now }) {
  const createdAt = toIsoTimestamp(now, 'now');
  const selectedSources = (context?.selectedSources ?? []).map(snapshotSource).sort((left, right) => left.id.localeCompare(right.id));
  const scope = snapshotScope(context?.scope);
  const libraryDecisions = snapshotLibraryDecisions(context?.libraryDecisions);
  const gaps = JSON.parse(canonicalJson(context?.gaps ?? []));
  const ambiguities = JSON.parse(canonicalJson(context?.ambiguities ?? []));
  const sourceDigest = digest({ selectedSources, scope, libraryDecisions });
  const snapshot = {
    id: digest({ taskId, createdAt, sourceDigest, selectedSources, scope, libraryDecisions, gaps, ambiguities }),
    taskId,
    createdAt,
    sourceDigest,
    selectedSources,
    scope,
    libraryDecisions,
    gaps,
    ambiguities
  };
  return assertSnapshot(snapshot);
}

function diffSources(previous, next) {
  const oldSources = new Map(previous.selectedSources.map((source) => [source.id, source]));
  const newSources = new Map(next.selectedSources.map((source) => [source.id, source]));
  const ids = [...new Set([...oldSources.keys(), ...newSources.keys()])].sort();
  const changes = [];
  for (const sourceId of ids) {
    const before = oldSources.get(sourceId);
    const after = newSources.get(sourceId);
    if (!before) changes.push({ sourceId, type: 'added' });
    else if (!after) changes.push({ sourceId, type: 'removed' });
    else if (before.bodyDigest !== after.bodyDigest) changes.push({ sourceId, type: 'body-changed' });
    else if (before.accessible !== after.accessible) changes.push({ sourceId, type: 'accessibility-changed' });
  }
  return changes;
}

export function compareContextSnapshots(previous, next) {
  const changes = diffSources(previous, next);
  if (canonicalJson(previous.scope) !== canonicalJson(next.scope)) changes.push({ type: 'scope-changed' });
  if (canonicalJson(previous.libraryDecisions) !== canonicalJson(next.libraryDecisions)) changes.push({ type: 'library-decisions-changed' });
  if (canonicalJson(previous.gaps) !== canonicalJson(next.gaps)) changes.push({ type: 'gap-changed' });
  if (canonicalJson(previous.ambiguities) !== canonicalJson(next.ambiguities)) changes.push({ type: 'ambiguity-changed' });
  return { material: changes.length > 0, changes };
}

export async function refreshContextSnapshot(snapshot, hostAdapter, policy, now) {
  if (typeof hostAdapter?.refresh !== 'function') throw new TypeError('hostAdapter.refresh must be a function');
  const context = await hostAdapter.refresh(snapshot, policy);
  if (context?.snapshot && context?.comparison) return context;
  const next = createContextSnapshot({
    taskId: snapshot.taskId,
    context: {
      ...context,
      scope: context?.scope ?? snapshot.scope,
      libraryDecisions: context?.libraryDecisions ?? snapshot.libraryDecisions
    },
    now
  });
  return { snapshot: next, comparison: compareContextSnapshots(snapshot, next) };
}
