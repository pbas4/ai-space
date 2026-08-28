const REQUIRED = ['discoverContext', 'refreshContext', 'proposeImplementation', 'applyImplementation', 'verify'];

export function createCodexHostAdapter(host) {
  for (const name of REQUIRED) {
    if (typeof host?.[name] !== 'function') throw new TypeError(`${name} must be a function`);
  }

  return Object.freeze({
    discover: (request, policy) => host.discoverContext(request, policy),
    refresh: (snapshot, policy) => host.refreshContext(snapshot, policy),
    implementationAdapter: Object.freeze({
      propose: host.proposeImplementation,
      apply: host.applyImplementation
    }),
    verifier: Object.freeze({ run: host.verify })
  });
}
