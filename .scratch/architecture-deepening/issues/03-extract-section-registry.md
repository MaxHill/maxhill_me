Status: ready-for-agent

# Extract section registry as shared constant

## What to build

The component page template defines a `sections` array (tab IDs like `overview`, `examples`, `properties`, etc.) and the layout independently hard-codes the same IDs prefixed with `section-` when registering keyboard commands. This implicit string contract means renaming a tab silently breaks navigation.

Extract the section definitions into a single source of truth. The page template should pass available sections to `ComponentsLayout` as a prop (or the layout should read them from a shared constant). The layout's `registerCommand` calls should derive from this prop rather than hard-coding IDs.

## Acceptance criteria

- [ ] Section IDs are defined in one place only
- [ ] `ComponentsLayout` receives sections as a prop and registers keyboard commands from it
- [ ] Adding or removing a section requires changing only one file
- [ ] All keyboard shortcuts (`Space o`, `Space x`, etc.) still work correctly
- [ ] Command palette still lists all section commands with correct labels
- [ ] Build passes

## Blocked by

None - can start immediately
