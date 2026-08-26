const MODEL = { model: 'gpt-5.6-luna', reasoning: 'light' };

export function createPrDescription({ task, changedArtifacts = [], verification = {}, uiReview = {} }) {
  const pathParts = changedArtifacts[0]?.split('/').filter(Boolean) ?? [];
  const sourceIndex = pathParts.indexOf('src');
  const pathComponent = sourceIndex > 0 ? pathParts[sourceIndex - 1] : pathParts.at(-2) ?? 'component';
  const component = task.match(/\b[A-Z][A-Za-z]*[A-Z][A-Za-z]*\b/)?.[0] ?? pathComponent.replace(/^./, (letter) => letter.toUpperCase());
  const checks = (verification.checks ?? []).filter((check) => check.status === 'passed').map((check) => check.name);
  const checkSummary = checks.length ? checks.join(', ') : 'the recorded verification checks';
  return {
    model: MODEL,
    title: `Update ${component}`,
    body: `## Summary\n\nThis change addresses ${task.toLowerCase()}.\n\n## Why\n\nIt keeps the component experience consistent and reliable for users.\n\n## Verification\n\nVerified with ${checkSummary}. UI review: ${uiReview.completion ?? 'completed'}.\n\n## Notes\n\nThe change follows the existing component conventions.`,
  };
}
