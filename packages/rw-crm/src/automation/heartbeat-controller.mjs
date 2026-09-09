const EXECUTABLE = Object.freeze({ action: 'execute-one-task', nextRun: 'after-verification' });

function pause(action, reason) {
  return { action, taskId: null, reason, nextRun: null };
}

function validPlan(plan) {
  return plan && Array.isArray(plan.tasks) && plan.tasks.every((task) => task && typeof task.id === 'string' && task.id.length > 0);
}

function completed(task) {
  return ['complete', 'completed', 'verified'].includes(task.status);
}

export function evaluateHeartbeatRun({ plan, repoState = {}, approvals = {}, workflowState = {} } = {}) {
  if (!validPlan(plan)) return pause('blocked', 'plan is missing or invalid');
  if (plan.tasks.every(completed)) return pause('complete', 'all plan tasks are complete');
  if (repoState.unrelatedChanges) return pause('blocked', 'unrelated working-tree changes require user review');
  if (repoState.sourcePolicyRejected) return pause('blocked', 'source policy rejection requires user review');
  if (repoState.clean === false) return pause('blocked', 'working-tree changes require user review');
  if (workflowState.contextChanged) return pause('awaiting-approval', 'material context change requires reapproval');
  if (workflowState.testsPassed === false) return pause('blocked', 'verification failed and requires user review');
  if (approvals.plan !== true || approvals.codeEdits !== true) return pause('awaiting-approval', 'plan and code-edit approvals are required');
  const task = plan.tasks.find((candidate) => !completed(candidate));
  if (!task) return pause('complete', 'all plan tasks are complete');
  return { ...EXECUTABLE, taskId: task.id, reason: 'next unchecked task is eligible' };
}
