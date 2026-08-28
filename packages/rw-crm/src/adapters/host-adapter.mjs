const REQUIRED = ['discoverCandidates', 'retrieveSource', 'refreshContext', 'proposeImplementation', 'applyImplementation', 'verify'];

export function createCodexHostAdapter(host, sourcePolicy) {
  for (const name of REQUIRED) {
    if (typeof host?.[name] !== 'function') throw new TypeError(`${name} must be a function`);
  }
  if (typeof sourcePolicy?.authorizeSource !== 'function') throw new TypeError('sourcePolicy.authorizeSource must be a function');

  return Object.freeze({
    discover: async (request) => {
      const candidates = await host.discoverCandidates(request);
      const authorized = candidates.map((candidate) => ({ candidate, decision: sourcePolicy.authorizeSource(candidate) }));
      const sources = await Promise.all(authorized
        .filter(({ decision }) => decision.allowed)
        .map(({ candidate, decision }) => host.retrieveSource({ ...candidate, normalized: decision.normalized })));
      const gaps = authorized
        .filter(({ decision }) => !decision.allowed)
        .map(({ candidate, decision }) => ({
          sourceId: candidate.id,
          reason: decision.reason,
          impact: 'source was rejected before retrieval'
        }));
      return { sources, gaps };
    },
    refresh: (snapshot, policy) => host.refreshContext(snapshot, policy),
    implementationAdapter: Object.freeze({
      propose: host.proposeImplementation,
      apply: host.applyImplementation
    }),
    verifier: Object.freeze({ run: host.verify })
  });
}
