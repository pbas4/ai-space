function normalizeFinding(finding, index) {
  const severity = finding.severity ?? 'medium';
  return { id: finding.id ?? `review-${index + 1}`, ...finding, severity, blocking: severity === 'critical' };
}

export async function reviewImplementation({ request, approvedPlan, changedArtifacts }, { contextAdapter, evidenceAdapter, checklist }) {
  const context = await contextAdapter.discover(request);
  const evidence = await evidenceAdapter.inspect({ request, approvedPlan, changedArtifacts, context, checklist });
  const findings = (evidence.findings ?? []).map(normalizeFinding);
  for (const decision of context.libraryDecisions ?? []) {
    if (decision.authority === 'ui-library') findings.push(normalizeFinding({ category: 'library-decision', severity: 'medium', message: 'UI library authority was preserved over Figma.', evidence: [decision] }, findings.length));
  }
  const completion = findings.some((item) => item.blocking) ? 'blocked' : findings.length ? 'pass-with-findings' : 'pass';
  return { findings, verification: { checks: evidence.checks ?? [], changedArtifacts }, completion, proposedLearningEntry: null };
}
