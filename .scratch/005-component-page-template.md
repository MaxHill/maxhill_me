# Component page template with tabs

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Parent

`.scratch/component-docs-page.md`

## What to build

A dynamic Astro page at `/components/[component].astro` that renders a full component documentation page. Uses the components layout (sidebar + statusbar) and fills the content area with:

1. **Component header**: Tag name (large, display font) + metadata badges (FORM, N SLOTS, N PROPS, N EVENTS)

2. **Section tabs** using `<m-tab-list transition="terminal-wipe">`: overview, examples, properties, methods, events, slots, css parts. Tabs with no data are rendered with the `disabled` attribute.

3. **Tab panels**:
   - **Overview**: CEM description (rendered as markdown) + the first example (from example discovery utility) rendered via `CodeExample` component
   - **Examples**: All examples except the first, each with optional explanation above, then live preview + source
   - **Properties**: Table with Name, Type, Default, Description columns
   - **Methods**: Table with Name, Type, Description columns
   - **Events**: Table with Name, Detail Type, Description columns
   - **Slots**: Table with Name, Description columns
   - **CSS Parts**: Table with Name, Description columns

4. **Example rendering**: `explanation.md` content rendered above the example. `CodeExample` receives `html`, `css`, `js` props with file contents read at build time.

5. **Empty table state**: Tables in disabled tabs show nothing (tab is disabled so panel is inaccessible). If somehow accessed, show "No {section} defined."

Visual reference: prototype v5 component-view, section-tabs, section-panels, and table styles.

## Acceptance criteria

- [ ] `/components/m-tab-list` renders correctly with real data (requires slice 3 to be complete)
- [ ] Component header shows tag name and correct badges
- [ ] `m-tab-list` is used for section tabs with `transition="terminal-wipe"`
- [ ] Tabs with no data are disabled
- [ ] Overview tab shows CEM description + first example
- [ ] Examples tab shows all examples except the first
- [ ] Explanation markdown renders above its example
- [ ] API tables (properties, methods, events, slots, CSS parts) render correctly from CEM data
- [ ] Table styling matches prototype v5 (dense, monospace names, muted types)
- [ ] Astro `getStaticPaths` generates a page for each component in the CEM
- [ ] 404-style handling for unknown component names

## Blocked by

- `.scratch/003-migrate-m-tab-list.md`
- `.scratch/004-components-layout.md`
