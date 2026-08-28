const TARGET = 'rw-crm-components';
const TARGET_TEMPLATE = 'rw-crm-components';
const TARGET_VERIFICATION = ['package.json version', 'CHANGELOG.md'];

function valuesFrom(input) {
  return Array.isArray(input) ? input.filter((value) => typeof value === 'string' && value.trim()) : [];
}

function normalizeRemote(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let remote = value.trim().replace(/\.git\/?$/i, '');
  remote = remote.replace(/^[a-z][a-z\d+.-]*:\/\//i, '');
  remote = remote.replace(/^[^@/]+@/, '');
  remote = remote.replace(/^([^/:]+):/, '$1/');
  remote = remote.replace(/^\/+|\/+$/g, '').toLowerCase();
  return /^[^/]+\/.+/.test(remote) ? remote : null;
}

function pathSegments(value) {
  return value.toLowerCase().replace(/\\/g, '/').split('/').filter(Boolean);
}

function partialMatch(value) {
  return typeof value === 'string' && value.toLowerCase().includes('crm-components');
}

export function resolveRepositoryPolicy({ repository, repositoryName, repositoryScope = [], changedArtifacts = [] } = {}) {
  const evidence = [];
  const remote = normalizeRemote(repository);
  const remoteTarget = remote?.endsWith(`/${TARGET}`);
  if (remoteTarget) evidence.push({ kind: 'normalized-remote', value: remote });
  else if (partialMatch(repository ?? '')) evidence.push({ kind: 'partial-name-match', source: 'repository', value: repository });

  if (partialMatch(repositoryName ?? '')) {
    evidence.push({ kind: 'partial-name-match', source: 'repositoryName', value: repositoryName });
  }

  const pathEvidence = [
    ...valuesFrom(repositoryScope).map((value) => ['repositoryScope', value]),
    ...valuesFrom(changedArtifacts).map((value) => ['changedArtifacts', value])
  ];
  let pathTarget = false;
  for (const [source, value] of pathEvidence) {
    if (pathSegments(value).includes(TARGET)) {
      evidence.push({ kind: 'path-segment', source, value });
      pathTarget = true;
      continue;
    }
    if (partialMatch(value)) evidence.push({ kind: 'partial-name-match', source, value });
  }

  const target = remoteTarget || pathTarget
    ? TARGET
    : evidence.some(({ kind }) => kind === 'partial-name-match')
      ? 'ambiguous'
      : 'other';
  const isTarget = target === TARGET;
  return {
    target,
    evidence,
    versioningRequired: isTarget,
    changelogRequired: isTarget,
    prTemplate: isTarget ? TARGET_TEMPLATE : null,
    verificationRules: isTarget ? [...TARGET_VERIFICATION] : []
  };
}
