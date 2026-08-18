function contextRisks(context) {
  return [
    ...(context.gaps ?? []).map((gap) => ({ type: 'missing-context', ...gap })),
    ...(context.ambiguities ?? []).map((ambiguity) => ({ type: 'ambiguous-context', ...ambiguity }))
  ];
}

export async function createInitialPlan(request, { contextAdapter, ledger }) {
  const context = await contextAdapter.discover(request);
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
