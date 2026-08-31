import { approveModelEscalation, approveModelExecution, classifyTask, proposeModelExecution, requestModelEscalation } from '../routing/model-router.mjs';
import { routeUiTask } from '../routing/ui-task-router.mjs';
import { createWorkerExecution } from './worker-execution.mjs';
import { createContextSnapshot } from '../context/context-snapshot.mjs';

function taskIdFor(request) {
  return request.taskId ?? request.task;
}

function now(deps) {
  return deps.clock ? deps.clock() : new Date();
}

async function getOrCreateContextSnapshot(request, deps) {
  if (request.contextSnapshot) return { context: null, contextSnapshot: request.contextSnapshot };
  const context = await deps.contextAdapter.discover(request);
  return { context, contextSnapshot: createContextSnapshot({ taskId: taskIdFor(request), context, now: now(deps) }) };
}

export async function runRwCrmOrchestrator(request, deps) {
  const routing = routeUiTask(request);
  const base = { routing, modelProposal: null, planner: null, planReview: null, planApproval: null, engineer: null, uiReview: null, prDescription: null };
  if (!routing.invoke) return { ...base, status: 'skipped' };
  const { context: contextSummary, contextSnapshot } = await getOrCreateContextSnapshot(request, deps);
  const modelProposal = proposeModelExecution(request, classifyTask(request, contextSummary ?? contextSnapshot));
  if (!request.modelApproval) return { ...base, modelProposal, status: 'awaiting-model-approval' };
  let approvedModels = approveModelExecution(modelProposal, request.modelApproval);

  async function runWorker(role, input) {
    const invoke = (models, escalation = null) => deps[role](input, createWorkerExecution({
      proposalId: models.proposalId,
      role,
      assignment: models.assignments[role],
      approvedAt: models.approval.approvedAt,
      escalation
    }));
    let result = await invoke(approvedModels);
    if (!result?.modelEscalation) return { result };
    const escalation = requestModelEscalation(approvedModels, result.modelEscalation.target, result.modelEscalation.reason);
    if (!request.modelEscalationApproval) return { escalation };
    approvedModels = approveModelEscalation(approvedModels, escalation, request.modelEscalationApproval);
    result = await invoke(approvedModels, approvedModels.escalation);
    if (result?.modelEscalation) return { escalation: requestModelEscalation(approvedModels, result.modelEscalation.target, result.modelEscalation.reason) };
    return { result };
  }

  const plannerRun = await runWorker('planner', { request, contextSnapshot });
  if (plannerRun.escalation) return { ...base, modelProposal: approvedModels, modelEscalation: plannerRun.escalation, status: 'awaiting-model-escalation' };
  const planner = { ...plannerRun.result, contextSnapshot };
  if (request.environment === 'create-task-plan-plugin') {
    return { ...base, modelProposal: approvedModels, planner, planReview: { mode: 'plugin-brainstorming-review', delegated: true }, status: 'awaiting-plugin-plan-review' };
  }
  const reviewRun = await runWorker('planReviewer', { request, initialPlan: planner.plan, contextSnapshot });
  if (reviewRun.escalation) return { ...base, modelProposal: approvedModels, planner, modelEscalation: reviewRun.escalation, status: 'awaiting-model-escalation' };
  const planReview = { ...reviewRun.result, contextSnapshot };
  if (planReview.recommendation === 'blocked') return { ...base, modelProposal: approvedModels, planner, planReview, status: 'blocked' };
  if (planReview.recommendation === 'revise') return { ...base, modelProposal: approvedModels, planner, planReview, status: 'awaiting-plan-revision' };
  if (!request.approvedPlan || request.approvedPlan.approvalStatus !== 'approved') {
    return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: 'awaiting-approval', status: 'awaiting-plan-approval' };
  }
  const engineerRun = await runWorker('engineer', { request, approvedPlan: request.approvedPlan, contextSnapshot });
  if (engineerRun.escalation) return { ...base, modelProposal: approvedModels, planner, planReview, modelEscalation: engineerRun.escalation, status: 'awaiting-model-escalation' };
  const engineer = { ...engineerRun.result, contextSnapshot: engineerRun.result.contextSnapshot ?? contextSnapshot };
  if (engineer.status !== 'implemented') return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: request.approvedPlan.approval, engineer, status: engineer.status };
  const uiReviewRun = await runWorker('uiReviewer', { request, approvedPlan: request.approvedPlan, changedArtifacts: engineer.changedArtifacts, contextSnapshot });
  if (uiReviewRun.escalation) return { ...base, modelProposal: approvedModels, planner, planReview, engineer, modelEscalation: uiReviewRun.escalation, status: 'awaiting-model-escalation' };
  const uiReview = { ...uiReviewRun.result, contextSnapshot };
  if (uiReview.completion === 'blocked') return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: request.approvedPlan.approval, engineer, uiReview, status: 'blocked' };
  const prRun = deps.prWriter ? await runWorker('prWriter', {
    task: request.task,
    repository: request.repository,
    repositoryName: request.repositoryName,
    repositoryScope: request.repositoryScope,
    ticketNumber: request.ticketNumber,
    ticket_number: request.ticket_number,
    additionalNotes: request.additionalNotes,
    description: request.description,
    prType: request.prType,
    changedArtifacts: engineer.changedArtifacts,
    verification: engineer.verification,
    uiReview,
    approvedPlan: request.approvedPlan,
    contextSnapshot
  }) : { result: null };
  if (prRun.escalation) return { ...base, modelProposal: approvedModels, planner, planReview, engineer, uiReview, modelEscalation: prRun.escalation, status: 'awaiting-model-escalation' };
  const prDescription = prRun.result && { ...prRun.result, contextSnapshot };
  return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: request.approvedPlan.approval, engineer, uiReview, prDescription, status: 'complete' };
}
