import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrDescription } from '../src/review/pr-description-writer.mjs';

test('creates a concise human-sounding PR description from approved work', () => {
  const result = createPrDescription({
    task: 'Fix DatePicker keyboard navigation',
    changedArtifacts: ['libs/ui/data-entry/datepicker/src/lib/datepicker.tsx'],
    verification: { checks: [{ name: 'unit', status: 'passed' }] },
    uiReview: { completion: 'pass' }
  });
  assert.equal(result.model.model, 'gpt-5.6-luna');
  assert.equal(result.model.reasoning, 'light');
  assert.match(result.title, /DatePicker/);
  assert.match(result.body, /## Summary/);
  assert.match(result.body, /## Why/);
  assert.match(result.body, /## Verification/);
  assert.doesNotMatch(result.body, /implementation detail|internal architecture/i);
});

test('uses the rw-crm-components PR template and fills its fields', () => {
  const result = createPrDescription({
    task: 'Fix DatePicker keyboard navigation',
    repository: 'rw-crm-components',
    ticketNumber: 'CRM-123',
    additionalNotes: 'Please verify this in Storybook.',
    changedArtifacts: ['libs/ui/data-entry/datepicker/src/lib/datepicker.tsx'],
    verification: { checks: [{ name: 'unit tests', status: 'passed' }] },
    uiReview: { completion: 'pass' }
  });

  assert.match(result.body, /## PR Type/);
  assert.match(result.body, /\[x\] Bug fix/);
  assert.match(result.body, /\[ \] Feature/);
  assert.match(result.body, /## Description\n\nThis change addresses fix datepicker keyboard navigation\./);
  assert.match(result.body, /## Ticket Number\n\nCRM-123/);
  assert.match(result.body, /## Additional Notes\n\nPlease verify this in Storybook\./);
});

test('does not apply the repository template to unrelated repositories', () => {
  const result = createPrDescription({ task: 'Fix Button styles', repository: 'crm-web', changedArtifacts: ['src/Button.tsx'] });
  assert.doesNotMatch(result.body, /## PR Type/);
  assert.match(result.body, /## Summary/);
});
