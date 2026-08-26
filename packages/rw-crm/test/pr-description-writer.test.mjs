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
