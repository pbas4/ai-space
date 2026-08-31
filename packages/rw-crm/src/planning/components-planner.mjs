function contextRisks(context) {
  return [
    ...(context.gaps ?? []).map((gap) => ({ type: 'missing-context', ...gap })),
    ...(context.ambiguities ?? []).map((ambiguity) => ({ type: 'ambiguous-context', ...ambiguity }))
  ];
}

function workerInput(input) {
  return input?.request
    ? { request: input.request, contextSnapshot: input.contextSnapshot ?? input.request.contextSnapshot ?? null }
    : { request: input, contextSnapshot: input?.contextSnapshot ?? null };
}

export async function createInitialPlan(input, { contextAdapter, ledger }) {
  const { request, contextSnapshot } = workerInput(input);
  const context = contextSnapshot ?? await contextAdapter.discover(request);
  const lessons = await ledger.consult(request, context);
  const scope = context.scope ?? { components: request.componentScope ?? [], screens: [], routes: [] };
  const components = scope.components?.length ? scope.components : request.componentScope ?? [];
  const id = `plan:${request.task}`;
  const plan = {
    id,
    goal: request.task,
    scope,
    files: components.map((component) => `determine ${component} implementation files`),
    interfaces: components.map((component) => `${component} public component API`),
    risks: contextRisks(context),
    verification: ['targeted unit tests', 'accessibility checks', 'relevant visual or component checks'],
    libraryDecisions: context.libraryDecisions ?? [],
    lessons,
    approvalStatus: 'awaiting-approval'
  };
  return { context, plan, proposedLearningEntry: null };
}
