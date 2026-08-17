import { assertImplementationAuthorized, approveCodeEdits, approvePlan, createApprovalState } from './approval-gate.mjs';

const emptyVerification = { checks: [] };

export async function runEngineerWorkflow(request, deps) {
  const context = await deps.contextAdapter.discover(request);
  const base = {
    context,
    plan: null,
    status: 'needs-context',
    changedArtifacts: [],
    verification: emptyVerification,
    proposedLearningEntry: null
  };
  if (context.gaps?.length || context.ambiguities?.length) return base;

  const plan = await deps.implementationAdapter.propose(context, request);
  let state = createApprovalState(plan.id, plan.editSetHash);
  if (!request.approvals?.plan) return { ...base, plan, status: 'awaiting-plan-approval' };
  state = approvePlan(state, request.approvals.plan);
  if (!request.approvals?.codeEdits) return { ...base, plan, status: 'awaiting-edit-approval' };
  state = approveCodeEdits(state, request.approvals.codeEdits);

  assertImplementationAuthorized(state);
  const changedArtifacts = await deps.implementationAdapter.apply(plan, plan.edits ?? []);
  const verification = await deps.verifier.run(request.componentScope ?? [], changedArtifacts);
  return { ...base, plan, status: 'implemented', changedArtifacts, verification };
}
