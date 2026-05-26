# Eliminate dark theme flash on page navigation

- **Status**: ready-for-agent
- **Created**: 2026-05-26

## Problem Statement

When navigating between pages on the site with dark theme active, users see a brief white flash. This happens because the site is an MPA — each navigation tears down the document and rebuilds it, causing a moment where the page renders without `data-theme="dark"` before the inline script runs.

## Solution

Add Astro View Transitions for client-side navigation (no animation). The `<html>` element persists across navigations, so `data-theme` is never lost. Simplify the ThemeSwitcher by removing the `startViewTransition` animation wrapper — theme changes become instant.

## User Stories

1. As a dark-theme user, I want page navigations to be seamless, so that I never see a white flash between pages.
2. As a user toggling themes, I want the switch to happen instantly, so that there is no unnecessary delay or animation.
3. As a user on a slow connection, I want in-app navigation to feel fast, so that I don't wait for full page reloads.

## Implementation Decisions

- Add `<ViewTransitions />` from `astro:transitions` to `BaseLayout.astro` (applies to all pages universally).
- Set `transition:animate="none"` as the default — client-side DOM swap with no crossfade or morph animation.
- Keep the existing inline blocking `<script>` in `<head>` — it handles first-load and hard-refresh cases where View Transitions don't apply.
- Remove the `document.startViewTransition()` wrapper in ThemeSwitcher's change handler — call `updateTheme(theme)` directly.
- Web components use `customElements.define()` via a module script (`register-all`). This only runs once per page lifetime; components self-manage via `connectedCallback`/`disconnectedCallback`, so they work correctly when the DOM is swapped by View Transitions.

## Testing Decisions

No dedicated tests. The changes are declarative (adding an Astro component, removing a conditional wrapper). Verification is visual — confirm dark theme persists across navigation and theme toggle works instantly.

## Out of Scope

- Theme persistence via cookies/SSR
- Page transition animations (crossfade, morph, slide)
- Changes to the web component registration pattern
- Any changes to the inline head script

## Further Notes

If web components exhibit unexpected behavior after View Transitions are enabled (e.g., stale event listeners, missing state), the fix would be adding `data-astro-rerun` to the registration script or handling the `astro:after-swap` event. This is unlikely given proper custom element lifecycle usage but worth watching during manual testing.
