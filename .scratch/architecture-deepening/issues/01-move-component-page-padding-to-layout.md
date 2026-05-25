Status: ready-for-agent

# Move `.component-page` padding into ComponentsLayout

## What to build

The `:global(.component-page) { padding-top: var(--menu-height); }` rule is duplicated in both `[component].astro` and `index.astro`. Move it into `ComponentsLayout.astro` so the layout owns its own positioning contract. Remove the duplicate from both page files.

## Acceptance criteria

- [ ] The `:global(.component-page)` style exists only in `ComponentsLayout.astro`
- [ ] Both `/components` and `/components/{tag-name}` pages render correctly with the menu not overlapping content
- [ ] No duplicate style rules across the two page files
- [ ] Build passes

## Blocked by

None - can start immediately
