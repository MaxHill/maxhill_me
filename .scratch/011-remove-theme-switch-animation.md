# Remove startViewTransition animation from ThemeSwitcher

- **Status**: ready-for-agent
- **Created**: 2026-05-26

## Parent

`.scratch/009-eliminate-dark-theme-flash.md`

## What to build

Simplify the ThemeSwitcher component's change handler by removing the `document.startViewTransition()` wrapper. The theme toggle should call `updateTheme(theme)` directly — no animation, no conditional branching on API availability.

## Acceptance criteria

- [ ] The `document.startViewTransition` conditional block is removed from the form change event handler
- [ ] `updateTheme(theme)` is called directly on theme selection change
- [ ] Theme switching still works correctly (sets `data-theme` attribute and persists to localStorage)
- [ ] No animation occurs when toggling between light/dark/system

## Blocked by

None - can start immediately
