const SENSITIVE_KEY = /(approval|credential|secret|token|source.?bod|hash|digest)/i;
const DIGEST = /\b[a-f0-9]{64}\b/gi;

function visibleText(value) {
  return String(value ?? '').replace(DIGEST, '[internal digest omitted]').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

function taskSlug(value) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return /^[a-f0-9]{64}$/.test(normalized) || normalized === '' ? 'task' : normalized;
}

function normalizedTicketKey(value) {
  const candidate = String(value ?? '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]*-[0-9]+$/.test(candidate) ? candidate : null;
}

function sanitized(value) {
  if (Array.isArray(value)) return value.map(sanitized);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, child]) => [key, sanitized(child)]));
  }
  return typeof value === 'string' ? visibleText(value) : value;
}

function label(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

function inline(value) {
  if (Array.isArray(value)) return value.length ? value.map(inline).join(', ') : 'None';
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, child]) => `**${label(key)}:** ${inline(child)}`).join('; ');
  }
  if (value === null || value === undefined || value === '') return 'None';
  return visibleText(value);
}

function section(title, value, { scope = false } = {}) {
  const clean = sanitized(value);
  const entries = scope && clean && typeof clean === 'object' && !Array.isArray(clean)
    ? Object.entries(clean).map(([key, child]) => `- **${label(key)}:** ${inline(child)}`)
    : Array.isArray(clean)
      ? clean.map((item) => `- ${inline(item)}`)
      : clean === null || clean === undefined || clean === ''
        ? []
        : [`- ${inline(clean)}`];
  return `## ${title}\n\n${entries.length ? entries.join('\n') : '- None.'}`;
}

export function createPlanArtifact({ plan, task, ticketKey = null, revision = 1 }) {
  if (!plan || typeof plan !== 'object') throw new TypeError('plan must be an object');
  if (typeof plan.id !== 'string' || plan.id.trim() === '') throw new TypeError('plan ID is required');
  if (!Number.isInteger(revision) || revision < 1) throw new TypeError('revision must be a positive integer');

  const goal = visibleText(plan.goal ?? task ?? 'Task') || 'Task';
  const ticket = normalizedTicketKey(ticketKey);
  const displayPrefix = ticket ? `${ticket} — ` : '';
  const title = `${displayPrefix}${goal} — Plan v${revision}`;
  const filenamePrefix = ticket ?? 'rw-crm';
  const filename = `${filenamePrefix}-${taskSlug(task ?? plan.goal)}-plan-v${revision}.md`;
  const content = [
    `# ${title}`,
    `Revision ${revision}`,
    section('Goal', goal),
    section('Scope', plan.scope, { scope: true }),
    section('Affected Files', plan.files),
    section('Interfaces', plan.interfaces),
    section('Library Decisions', plan.libraryDecisions),
    section('Risks and Context Gaps', plan.risks),
    section('Verification', plan.verification),
    section('Open Questions', plan.questions),
    section('Approval Status', plan.approvalStatus)
  ].join('\n\n');

  return {
    kind: 'implementation-plan',
    title,
    filename,
    mediaType: 'text/markdown',
    revision,
    planId: plan.id,
    content
  };
}
