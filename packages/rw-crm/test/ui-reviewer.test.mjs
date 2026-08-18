import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewImplementation } from '../src/review/ui-reviewer.mjs';

const input = { request: { task: 'Fix DatePicker', componentScope: ['DatePicker'] }, approvedPlan: { id: 'p1' }, changedArtifacts: ['packages/ui/DatePicker.mjs'] };
const contextAdapter = { async discover() { return { gaps: [], ambiguities: [], libraryDecisions: [] }; } };

test('passes a clean implementation review without a write adapter', async () => {
  const result = await reviewImplementation(input, { contextAdapter, evidenceAdapter: { async inspect() { return { findings: [], checks: [{ name: 'a11y', status: 'passed' }] }; } }, checklist: [] });
  assert.equal(result.completion, 'pass');
  assert.equal(result.findings.length, 0);
});

test('blocks critical findings but reports lower severity findings', async () => {
  const critical = await reviewImplementation(input, { contextAdapter, evidenceAdapter: { async inspect() { return { findings: [{ severity: 'critical', category: 'accessibility', message: 'Keyboard trap' }], checks: [] }; } }, checklist: [] });
  assert.equal(critical.completion, 'blocked');
  assert.equal(critical.findings[0].blocking, true);
  const advisory = await reviewImplementation(input, { contextAdapter, evidenceAdapter: { async inspect() { return { findings: [{ severity: 'medium', category: 'visual', message: 'Spacing differs' }], checks: [] }; } }, checklist: [] });
  assert.equal(advisory.completion, 'pass-with-findings');
});

test('records UI library authority for Figma conflicts and reviews non-visual changes', async () => {
  const result = await reviewImplementation({ ...input, changedArtifacts: ['packages/ui/date-utils.mjs'] }, { contextAdapter: { async discover() { return { gaps: [], ambiguities: [], libraryDecisions: [{ figma: '8px', library: '4px', authority: 'ui-library' }] }; } }, evidenceAdapter: { async inspect() { return { findings: [], checks: [] }; } }, checklist: [] });
  assert.equal(result.completion, 'pass-with-findings');
  assert.equal(result.findings[0].category, 'library-decision');
});
