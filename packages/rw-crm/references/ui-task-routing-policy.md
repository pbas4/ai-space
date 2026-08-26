# RW CRM UI task routing policy

Classify work once and return its evidence and confidence:

- `ui-related`: explicit invocation, a Figma/design link, component scope, or explicit CRM UI-library/component-library/reusable-component language.
- `possible-ui`: generic UI, frontend, screen, layout, visual, form, input, button, style, or accessibility language without definite component evidence.
- `non-ui`: no UI evidence.

Standalone RW CRM uses the `possible-ui` threshold so a user can work directly with UI agents. Create Task Plan auto-invokes RW CRM only at the `ui-related` threshold; it asks one structured-choice confirmation for `possible-ui` work. Both paths preserve the same classification evidence.
