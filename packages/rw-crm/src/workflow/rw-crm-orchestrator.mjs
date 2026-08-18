import { approveModelExecution, classifyTask, proposeModelExecution } from '../routing/model-router.mjs';
import { routeUiTask } from '../routing/ui-task-router.mjs';

export async function runRwCrmOrchestrator(request, deps) {
  const routing = routeUiTask(request);
  const base = { routing, modelProposal: null, planner: null, planReview: null, planApproval: null, engineer: null, uiReview: null };
  if (!routing.invoke) return { ...base, status: 'skipped' };
  const contextSummary = await deps.contextAdapter.discover(request);
  const modelProposal = proposeModelExecution(request, classifyTask(request, contextSummary));
  if (!request.modelApproval) return { ...base, modelProposal, status: 'awaiting-model-approval' };
  const approvedModels = approveModelExecution(modelProposal, request.modelApproval);
  const planner = await deps.planner(request);
  if (request.environment === 'create-task-plan-plugin') {
    return { ...base, modelProposal: approvedModels, planner, planReview: { mode: 'plugin-brainstorming-review', delegated: true }, status: 'awaiting-plugin-plan-review' };
  }
  const planReview = await deps.planReviewer({ request, initialPlan: planner.plan });
  if (planReview.recommendation === 'blocked') return { ...base, modelProposal: approvedModels, planner, planReview, status: 'blocked' };
  if (planReview.recommendation === 'revise') return { ...base, modelProposal: approvedModels, planner, planReview, status: 'awaiting-plan-revision' };
  if (!request.approvedPlan || request.approvedPlan.approvalStatus !== 'approved') {
    return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: 'awaiting-approval', status: 'awaiting-plan-approval' };
  }
  const engineer = await deps.engineer({ request, approvedPlan: request.approvedPlan });
  if (engineer.status !== 'implemented') return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: request.approvedPlan.approval, engineer, status: engineer.status };
  const uiReview = await deps.uiReviewer({ request, approvedPlan: request.approvedPlan, changedArtifacts: engineer.changedArtifacts });
  return { ...base, modelProposal: approvedModels, planner, planReview, planApproval: request.approvedPlan.approval, engineer, uiReview, status: uiReview.completion === 'blocked' ? 'blocked' : 'complete' };
}
