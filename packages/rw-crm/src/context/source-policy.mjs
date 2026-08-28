function normalizeHost(host) {
  return host.toLowerCase().replace(/^www\./, '');
}

function normalizeAllowedHosts(hosts = []) {
  return new Set(hosts.map((host) => normalizeHost(String(host))));
}

function normalizeHttpsUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
    const host = normalizeHost(parsed.hostname);
    return { host, uri: `https://${host}${parsed.pathname}${parsed.search}${parsed.hash}` };
  } catch {
    return null;
  }
}

function confluenceIdFromPath(pathname) {
  const match = pathname.match(/(?:^|\/)(?:pages|wiki\/spaces\/[^/]+\/pages)\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function normalizeConfluence(uri) {
  const https = normalizeHttpsUri(uri);
  const id = https && confluenceIdFromPath(new URL(https.uri).pathname);
  return id ? { host: https.host, id, uri: `confluence://${id}` } : null;
}

function normalizeRepositoryRemote(uri) {
  if (typeof uri !== 'string' || !uri.trim()) return null;
  let remote = uri.trim().replace(/\.git\/?$/i, '');
  remote = remote.replace(/^[a-z][a-z\d+.-]*:\/\//i, '');
  remote = remote.replace(/^[^@/]+@/, '');
  remote = remote.replace(/^([^/:]+):/, '$1/');
  remote = remote.replace(/^\/+|\/+$/g, '').toLowerCase();
  return /^[^/]+\/.+/.test(remote) ? { remote } : null;
}

export function createSourcePolicy({ figmaHosts = [], confluenceHosts = [], repositoryRemotes = [] } = {}) {
  const allowedFigmaHosts = normalizeAllowedHosts(figmaHosts);
  const allowedConfluenceHosts = normalizeAllowedHosts(confluenceHosts);
  const allowedRepositoryRemotes = new Set(repositoryRemotes
    .map(normalizeRepositoryRemote)
    .filter(Boolean)
    .map(({ remote }) => remote));

  function authorizeSource(source) {
    if (!['figma', 'confluence', 'repository'].includes(source?.kind)) {
      return { allowed: false, normalized: null, reason: 'unknown-source-kind' };
    }

    if (source.kind === 'figma') {
      const normalized = normalizeHttpsUri(source.uri);
      if (!normalized) return { allowed: false, normalized: null, reason: 'invalid-uri' };
      return allowedFigmaHosts.has(normalized.host)
        ? { allowed: true, normalized, reason: null }
        : { allowed: false, normalized, reason: 'unapproved-host' };
    }

    if (source.kind === 'confluence') {
      const normalized = normalizeConfluence(source.uri);
      if (!normalized) return { allowed: false, normalized: null, reason: 'invalid-uri' };
      return allowedConfluenceHosts.has(normalized.host)
        ? { allowed: true, normalized, reason: null }
        : { allowed: false, normalized, reason: 'unapproved-host' };
    }

    const normalized = normalizeRepositoryRemote(source.uri);
    if (!normalized) return { allowed: false, normalized: null, reason: 'invalid-uri' };
    return allowedRepositoryRemotes.has(normalized.remote)
      ? { allowed: true, normalized, reason: null }
      : { allowed: false, normalized, reason: 'unapproved-host' };
  }

  return Object.freeze({ authorizeSource });
}
