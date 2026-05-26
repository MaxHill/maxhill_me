# Add View Transitions to BaseLayout (no animation)

- **Status**: ready-for-agent
- **Created**: 2026-05-26

## Parent

`.scratch/009-eliminate-dark-theme-flash.md`

## What to build

Add Astro's `<ViewTransitions />` component to `BaseLayout.astro` so that all page navigations use client-side DOM swapping instead of full page reloads. Disable all transition animations — the swap should be instant with no crossfade or morph.

The existing inline blocking script in `<head>` (which sets `data-theme` from localStorage) must remain untouched — it handles first-load and hard-refresh scenarios.

## Acceptance criteria

- [ ] `<ViewTransitions />` is imported from `astro:transitions` and rendered in the `<head>` of BaseLayout
- [ ] Default transition animation is set to `"none"` (no visual transition between pages)
- [ ] Navigating between pages in dark theme produces no white flash
- [ ] Web components continue to function after navigation (connectedCallback fires on new elements)
- [ ] The inline theme-detection script in `<head>` is unchanged

## Blocked by

None - can start immediately
