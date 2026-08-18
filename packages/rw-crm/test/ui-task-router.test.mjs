import test from 'node:test';
import assert from 'node:assert/strict';
import { routeUiTask } from '../src/routing/ui-task-router.mjs';

test('routes Figma-linked and clear UI work, and explicit invocation overrides a non-UI skip', () => {
  assert.equal(routeUiTask({ task: 'Update DatePicker', figmaLinks: ['figma://x'] }).invoke, true);
  assert.equal(routeUiTask({ task: 'Fix component button focus', figmaLinks: [] }).invoke, true);
  assert.equal(routeUiTask({ task: 'Update database index', figmaLinks: [] }).invoke, false);
  assert.equal(routeUiTask({ task: 'Update database index', explicitInvocation: true, figmaLinks: [] }).invoke, true);
});
