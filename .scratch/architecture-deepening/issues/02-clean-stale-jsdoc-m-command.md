Status: ready-for-agent

# Clean stale JSDoc in m-command

## What to build

The `m-command` component has template boilerplate JSDoc that documents phantom API (`@attr {string} example`, `@fires m-command-change`). This pollutes the Custom Elements Manifest and causes the component docs page to show properties/events that don't exist. Replace with accurate JSDoc reflecting the actual API: `keys`, `command`, `commandfor`, `preventDefault` attributes and `m-command-trigger`/`m-command-register`/`m-command-unregister` events.

## Acceptance criteria

- [ ] JSDoc in `packages/components/src/m-command/index.ts` accurately reflects the real attributes, properties, and events
- [ ] No phantom `example` attribute or `m-command-change` event in the generated CEM
- [ ] Build passes
- [ ] The `/components/m-command` page shows only real API members

## Blocked by

None - can start immediately
