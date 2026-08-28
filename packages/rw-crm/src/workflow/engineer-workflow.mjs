import { assertImplementationAuthorized, approveCodeEdits, approvePlan, createApprovalState, proposeCodeEdits } from './approval-gate.mjs';
import { compareContextSnapshots, createContextSnapshot } from '../context/context-snapshot.mjs';

const emptyVerification = { checks: [] };

function taskIdFor(request) {
  return request.taskId ?? request.task;
}

function now(deps) {
  return deps.clock ? deps.clock() : new Date();
}

async function getOrCreateContextSnapshot(request, suppliedSnapshot, deps) {
  if (suppliedSnapshot) return { context: null, contextSnapshot: suppliedSnapshot };
  const context = await deps.contextAdapter.discover(request);
  return { context, contextSnapshot: createContextSnapshot({ taskId: taskIdFor(request), context, now: now(deps) }) };
}

async function refreshSnapshot(contextSnapshot, deps) {
  const refreshed = await deps.contextAdapter.refresh(contextSnapshot, deps.sourcePolicy);
  if (refreshed?.snapshot && refreshed?.comparison) return refreshed;
  const snapshot = createContextSnapshot({ taskId: contextSnapshot.taskId, context: refreshed, now: now(deps) });
  return { snapshot, comparison: compareContextSnapshots(contextSnapshot, snapshot) };
}

function reapproval(base, previousSnapshot, refreshed) {
  return {
    ...base,
    contextSnapshot: refreshed.snapshot,
    previousSnapshotId: previousSnapshot.id,
    currentSnapshotId: refreshed.snapshot.id,
    changes: refreshed.comparison.changes,
    contextChanges: refreshed.comparison.changes,
    status: 'awaiting-context-reapproval'
  };
}

export async function runEngineerWorkflow({ request, approvedPlan, contextSnapshot: suppliedSnapshot }, deps) {
  const { context, contextSnapshot } = await getOrCreateContextSnapshot(request, suppliedSnapshot, deps);
  const base = {
    context: context ?? contextSnapshot,
    contextSnapshot,
    plan: null,
    status: 'needs-context',
    changedArtifacts: [],
    verification: emptyVerification,
    proposedLearningEntry: null
  };
  if (contextSnapshot.gaps?.length || contextSnapshot.ambiguities?.length) return base;

  if (!approvedPlan || approvedPlan.approvalStatus !== 'approved' || !request.approvals?.plan) {
    return { ...base, plan: approvedPlan ?? null, status: 'awaiting-plan-approval' };
  }
  let state;
  try {
    state = approvePlan(createApprovalState(approvedPlan, contextSnapshot), request.approvals.plan);
  } catch (error) {
    return { ...base, plan: approvedPlan, status: 'awaiting-plan-approval', approvalError: error.message };
  }
  const beforeProposal = await refreshSnapshot(contextSnapshot, deps);
  if (beforeProposal.comparison.material) return reapproval(base, contextSnapshot, beforeProposal);
  const editProposal = await deps.implementationAdapter.propose(context ?? contextSnapshot, request, approvedPlan);
  const plan = { ...approvedPlan, ...editProposal, id: approvedPlan.id };
  state = proposeCodeEdits(state, plan.edits ?? []);
  if (!request.approvals?.codeEdits) return { ...base, plan, status: 'awaiting-edit-approval' };
  state = approveCodeEdits(state, request.approvals.codeEdits);

  assertImplementationAuthorized(state);
  const beforeApply = await refreshSnapshot(contextSnapshot, deps);
  if (beforeApply.comparison.material) return reapproval({ ...base, plan }, contextSnapshot, beforeApply);
  const changedArtifacts = await deps.implementationAdapter.apply(plan, plan.edits ?? []);
  const verification = await deps.verifier.run(request.componentScope ?? [], changedArtifacts);
  return { ...base, plan, status: 'implemented', changedArtifacts, verification };
}
