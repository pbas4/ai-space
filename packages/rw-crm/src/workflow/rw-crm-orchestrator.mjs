import { approveModelEscalation, approveModelExecution, classifyTask, proposeModelExecution, requestModelEscalation } from '../routing/model-router.mjs';
import { routeUiTask } from '../routing/ui-task-router.mjs';
import { createWorkerExecution } from './worker-execution.mjs';

export async function runRwCrmOrchestrator(request, deps) {
  const routing = routeUiTask(request);
  const base = { routing, modelProposal: null, planner: null, planReview: null, planApproval: null, engineer: null, uiReview: null, prDescription: null };
  if (!routing.invoke) return { ...base, status: 'skipped' };
  const contextSummary = await deps.contextAdapter.discover(request);
  const modelProposal = proposeModelExecution(request, classifyTask(request, contextSummary));
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

  const plannerRun = await runWorker('planner', request);
  if (plannerRun.escalation) return { ...base, modelProposal: approvedModels, modelEscalation: plannerRun.escalation, status: 'awaiting-model-escalation' };
  const planner = plannerRun.result;
  if (request.environment === 'create-task-plan-plugin') {
    return { ...base, modelProposal: approvedModels, planner, planReview: { mode: 'plugin-brainstorming-review', delegated: true }, status: 'awaiting-plugin-plan-review' };
  }
  const reviewRun = await runWorker('planReviewer', { request, initialPlan: planner.plan });
  if (reviewRun.escalation) return { ...base, modelProposal: approvedModels, planner, modelEscalation: reviewRun.escalation, status: 'awaiting-model-escalation' };
  const planReview = reviewRun.result;
  if (planReview.recommendation === 'blocked') return { ...base, modelProposal: approvedModels, planner, planReview, status: 'blocked' };
  if (planReview.recommendation === 'revise') return { ...base, modelProposal: approvedModels, planner, planReview, status: 'awaiting-plan-revision' };
  if (!request.approvedPlan || request.approvedPlan.approvalStatus !== 'approved') {
    return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: 'awaiting-approval', status: 'awaiting-plan-approval' };
  }
  const engineerRun = await runWorker('engineer', { request, approvedPlan: request.approvedPlan });
  if (engineerRun.escalation) return { ...base, modelProposal: approvedModels, planner, planReview, modelEscalation: engineerRun.escalation, status: 'awaiting-model-escalation' };
  const engineer = engineerRun.result;
  if (engineer.status !== 'implemented') return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: request.approvedPlan.approval, engineer, status: engineer.status };
  const uiReviewRun = await runWorker('uiReviewer', { request, approvedPlan: request.approvedPlan, changedArtifacts: engineer.changedArtifacts });
  if (uiReviewRun.escalation) return { ...base, modelProposal: approvedModels, planner, planReview, engineer, modelEscalation: uiReviewRun.escalation, status: 'awaiting-model-escalation' };
  const uiReview = uiReviewRun.result;
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
    approvedPlan: request.approvedPlan
  }) : { result: null };
  if (prRun.escalation) return { ...base, modelProposal: approvedModels, planner, planReview, engineer, uiReview, modelEscalation: prRun.escalation, status: 'awaiting-model-escalation' };
  const prDescription = prRun.result;
  return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: request.approvedPlan.approval, engineer, uiReview, prDescription, status: 'complete' };
}
