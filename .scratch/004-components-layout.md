# Components layout with sidebar and statusbar

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Parent

`.scratch/component-docs-page.md`

## What to build

A shared Astro layout for all `/components/*` pages. This layout provides:

1. **Sidebar**: Lists all components (from CEM data utility) as `<a>` links to `/components/{tag-name}`. The current component is highlighted. Always visible on desktop (220px wide). On mobile, hidden by default — shown as an overlay (no slide animation) when a toggle button is pressed.

2. **Statusbar** (dedicated Astro component): Displays at the bottom of the viewport spanning full width. Shows the leader key prefix (`C-b`) and available tab shortcuts (`o` overview, `x` examples, `p` props, `m` methods, `e` events, `s` slots, `c` css). Includes mode indicator and blinking cursor aesthetic from prototype v5. Updates visually when leader mode is active (mode label changes to "COMMAND" with destructive color).

3. **App shell grid**: `sidebar | content` on desktop with statusbar spanning the bottom. Content area is a slot that individual component pages fill.

Visual reference: prototype v5's `.app`, `.sidebar`, and `.statusbar` styles.

## Acceptance criteria

- [ ] Shared layout component exists and is usable by component pages
- [ ] Sidebar renders all component names as links from CEM data
- [ ] Current component is visually highlighted in sidebar
- [ ] Sidebar is always visible on desktop
- [ ] On mobile, sidebar is hidden by default and appears as an overlay via toggle button
- [ ] Statusbar Astro component exists separately
- [ ] Statusbar displays leader key and tab shortcut hints
- [ ] Statusbar shows mode indicator and blinking cursor
- [ ] App shell uses CSS grid matching prototype v5 layout
- [ ] Page takes full viewport height (no page scroll, content area scrolls internally)

## Blocked by

- `.scratch/001-example-discovery-utility.md`
- `.scratch/002-cem-data-utility.md`
