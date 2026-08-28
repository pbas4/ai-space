function finding(id, severity, category, message, evidence = []) {
  return { id, severity, category, message, evidence, blocking: severity === 'critical' };
}

export async function reviewPlan({ request, initialPlan, contextSnapshot = null }, { contextAdapter, checklist, ledger }) {
  const context = contextSnapshot ?? await contextAdapter.discover(request);
  const findings = [];
  if (context.gaps?.length || context.ambiguities?.length) {
    findings.push(finding('context-incomplete', 'critical', 'context', 'Required context is missing or ambiguous.', [...(context.gaps ?? []), ...(context.ambiguities ?? [])]));
  }
  if (!initialPlan.verification?.length) findings.push(finding('verification-incomplete', 'high', 'verification', 'The plan does not define verification.', []));
  const libraryDecisions = context.libraryDecisions?.length ? context.libraryDecisions : initialPlan.libraryDecisions ?? [];
  for (const decision of libraryDecisions) {
    if (decision.authority === 'ui-library') findings.push(finding(`library:${decision.topic ?? 'conflict'}`, 'medium', 'library-decision', 'UI library takes precedence over conflicting Figma direction.', [decision]));
  }
  const proposedLearningEntry = await ledger.consult(request, context, checklist);
  const recommendation = findings.some((item) => item.blocking) ? 'blocked' : findings.some((item) => item.severity === 'high') ? 'revise' : 'approve';
  return { findings, reviewedPlan: structuredClone(initialPlan), recommendation, proposedLearningEntry };
}
