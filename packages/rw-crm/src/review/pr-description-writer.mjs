import { resolveRepositoryPolicy } from '../policy/repository-policy.mjs';

const MODEL = { model: 'gpt-5.6-luna', reasoning: 'light' };

function inferPrType(task, explicitType) {
  const value = (explicitType ?? '').toLowerCase();
  if (value.includes('bug') || value.includes('fix')) return 'Bug fix';
  if (value.includes('refactor')) return 'Refactoring';
  if (value.includes('doc')) return 'Documentation content changes';
  if (value.includes('feature')) return 'Feature';
  if (/bug|fix|issue|correct|repair/.test(task.toLowerCase())) return 'Bug fix';
  if (/refactor|restructure|cleanup/.test(task.toLowerCase())) return 'Refactoring';
  if (/document|documentation|readme/.test(task.toLowerCase())) return 'Documentation content changes';
  if (/add|create|feature|implement|introduce/.test(task.toLowerCase())) return 'Feature';
  return 'Other';
}

function renderRwCrmComponentsTemplate({ task, description, prType, ticketNumber, additionalNotes }) {
  const types = ['Feature', 'Bug fix', 'Refactoring', 'Documentation content changes', 'Other (please describe)'];
  const checklist = types.map((type) => `[${type === prType ? 'x' : ' '}] ${type}`).join('\n');
  return `## PR Type\n\n${checklist}\n\n## Description\n\n${description ?? `This change addresses ${task.toLowerCase()}.`}\n\n## Ticket Number\n\n${ticketNumber ?? 'Not provided'}\n\n## Additional Notes\n\n${additionalNotes ?? 'No additional notes.'}`;
}

export function createPrDescription({ task, repository, repositoryName, repositoryScope = [], ticketNumber, ticket_number, additionalNotes, description, prType, changedArtifacts = [], verification = {}, uiReview = {} }) {
  const pathParts = changedArtifacts[0]?.split('/').filter(Boolean) ?? [];
  const sourceIndex = pathParts.indexOf('src');
  const pathComponent = sourceIndex > 0 ? pathParts[sourceIndex - 1] : pathParts.at(-2) ?? 'component';
  const component = task.match(/\b[A-Z][A-Za-z]*[A-Z][A-Za-z]*\b/)?.[0] ?? pathComponent.replace(/^./, (letter) => letter.toUpperCase());
  const checks = (verification.checks ?? []).filter((check) => check.status === 'passed').map((check) => check.name);
  const checkSummary = checks.length ? checks.join(', ') : 'the recorded verification checks';
  const repositoryPolicy = resolveRepositoryPolicy({ repository, repositoryName, repositoryScope, changedArtifacts });
  const body = repositoryPolicy.prTemplate === 'rw-crm-components'
    ? renderRwCrmComponentsTemplate({ task, description, prType: inferPrType(task, prType), ticketNumber: ticketNumber ?? ticket_number, additionalNotes })
    : `## Summary\n\nThis change addresses ${task.toLowerCase()}.\n\n## Why\n\nIt keeps the component experience consistent and reliable for users.\n\n## Verification\n\nVerified with ${checkSummary}. UI review: ${uiReview.completion ?? 'completed'}.\n\n## Notes\n\nThe change follows the existing component conventions.`;
  return {
    model: MODEL,
    title: `Update ${component}`,
    body,
  };
}
