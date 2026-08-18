const UI_TERMS = /\b(ui|frontend|component|figma|design system|accessibility|button|input|form|screen|layout|style|visual)\b/i;

export function routeUiTask({ task = '', explicitInvocation = false, figmaLinks = [], componentScope = [] }) {
  if (explicitInvocation) return { invoke: true, reason: 'explicit invocation', confidence: 'high' };
  if (figmaLinks.length) return { invoke: true, reason: 'Figma-linked task', confidence: 'high' };
  if (componentScope.length || UI_TERMS.test(task)) return { invoke: true, reason: 'UI-relevant task', confidence: 'medium' };
  return { invoke: false, reason: 'clearly non-UI task', confidence: 'high' };
}
