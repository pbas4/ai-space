const POSSIBLE_UI_TERMS = /\b(ui|frontend|accessibility|button|input|form|screen|layout|style|visual)\b/i;
const DEFINITE_UI_TERMS = /\b(ui[ -]?library|design system|component[ -]?library|reusable component|crm component)\b/i;
const CLASSIFICATION_RANK = Object.freeze({ 'non-ui': 0, 'possible-ui': 1, 'ui-related': 2 });

export function classifyUiTask({ task = '', explicitInvocation = false, figmaLinks = [], componentScope = [] }) {
  if (explicitInvocation) return { classification: 'ui-related', evidence: [{ kind: 'explicit-invocation', value: true }], confidence: 'high' };
  if (figmaLinks.length) return { classification: 'ui-related', evidence: figmaLinks.map((link) => ({ kind: 'figma-link', value: link })), confidence: 'high' };
  if (componentScope.length) return { classification: 'ui-related', evidence: componentScope.map((component) => ({ kind: 'component-scope', value: component })), confidence: 'high' };
  if (DEFINITE_UI_TERMS.test(task)) return { classification: 'ui-related', evidence: [{ kind: 'explicit-ui-component-language', value: task }], confidence: 'high' };
  if (POSSIBLE_UI_TERMS.test(task)) return { classification: 'possible-ui', evidence: [{ kind: 'generic-ui-language', value: task }], confidence: 'medium' };
  return { classification: 'non-ui', evidence: [{ kind: 'non-ui-language', value: task }], confidence: 'high' };
}

export function routeUiTask(input, { threshold = 'possible-ui' } = {}) {
  if (!(threshold in CLASSIFICATION_RANK)) throw new Error(`unknown UI routing threshold: ${threshold}`);
  const classification = classifyUiTask(input);
  const invoke = CLASSIFICATION_RANK[classification.classification] >= CLASSIFICATION_RANK[threshold];
  return {
    ...classification,
    invoke,
    reason: invoke ? `${classification.classification} task meets ${threshold} threshold` : `${classification.classification} task is below ${threshold} threshold`
  };
}

export { CLASSIFICATION_RANK };
