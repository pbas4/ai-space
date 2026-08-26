import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUiTask, routeUiTask } from '../src/routing/ui-task-router.mjs';

test('classifies definite, possible, and non-UI work with evidence', () => {
  assert.equal(classifyUiTask({ task: 'Improve screen spacing' }).classification, 'possible-ui');
  assert.equal(classifyUiTask({ task: 'Fix DatePicker', componentScope: ['DatePicker'] }).classification, 'ui-related');
  assert.equal(classifyUiTask({ task: 'Update database index' }).classification, 'non-ui');
  const explicit = classifyUiTask({ task: 'Update database index', explicitInvocation: true });
  assert.equal(explicit.classification, 'ui-related');
  assert.deepEqual(explicit.evidence, [{ kind: 'explicit-invocation', value: true }]);
});

test('uses entry-point thresholds to decide whether to invoke RW CRM', () => {
  const possible = { task: 'Improve screen spacing' };
  assert.equal(routeUiTask(possible).invoke, true);
  assert.equal(routeUiTask(possible, { threshold: 'ui-related' }).invoke, false);
  assert.equal(routeUiTask({ task: 'Update DatePicker', figmaLinks: ['figma://x'] }, { threshold: 'ui-related' }).invoke, true);
  assert.equal(routeUiTask({ task: 'Update database index' }).invoke, false);
});
