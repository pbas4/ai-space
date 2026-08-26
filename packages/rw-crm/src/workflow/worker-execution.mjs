export const WORKER_ROLES = Object.freeze(['planner', 'planReviewer', 'engineer', 'uiReviewer', 'prWriter']);

export function createWorkerExecution({ proposalId, role, assignment, approvedAt, escalation = null }) {
  if (!WORKER_ROLES.includes(role)) throw new Error(`unknown worker role: ${role}`);
  if (!assignment?.model || !assignment?.reasoning) throw new Error(`missing approved model assignment for ${role}`);
  return Object.freeze({
    proposalId,
    role,
    model: assignment.model,
    reasoning: assignment.reasoning,
    approvedAt,
    escalation
  });
}
