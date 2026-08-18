import { assertImplementationAuthorized, approveCodeEdits, approvePlan, createApprovalState } from './approval-gate.mjs';

const emptyVerification = { checks: [] };

export async function runEngineerWorkflow({ request, approvedPlan }, deps) {
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

  if (!approvedPlan || approvedPlan.approvalStatus !== 'approved' || !approvedPlan.approval) {
    return { ...base, plan: approvedPlan ?? null, status: 'awaiting-plan-approval' };
  }
  const editProposal = await deps.implementationAdapter.propose(context, request, approvedPlan);
  const plan = { ...approvedPlan, ...editProposal, id: approvedPlan.id };
  let state = createApprovalState(plan.id, plan.editSetHash);
  state = approvePlan(state, { planId: plan.id, ...approvedPlan.approval });
  if (!request.approvals?.codeEdits) return { ...base, plan, status: 'awaiting-edit-approval' };
  state = approveCodeEdits(state, request.approvals.codeEdits);

  assertImplementationAuthorized(state);
  const changedArtifacts = await deps.implementationAdapter.apply(plan, plan.edits ?? []);
  const verification = await deps.verifier.run(request.componentScope ?? [], changedArtifacts);
  return { ...base, plan, status: 'implemented', changedArtifacts, verification };
}
