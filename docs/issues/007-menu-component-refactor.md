## What to build

Refactor the imperative `main-menu.ts` into a proper component architecture:

1. **`m-main-menu` coordinator component** — MElement with shadow DOM, lit-html. Renders the menu bar layout and coordinates auth state. Uses lit-html template functions (not sub-components) for auth-dependent UI pieces (e.g. `renderAuthButton(loggedIn)` returning sign-in or sign-out button).

2. **`m-theme-switcher` reusable component** — Lives in `packages/components/`. Self-contained: renders radio inputs, handles localStorage persistence, view transitions, dispatches `themechange` event. Takes `data-target` and `data-persist` attributes (same API as current forms).

3. **Patch `m-popover-menu` shadow DOM compat** — Change anchor lookup from `document.getElementById(this.anchor)` to `(this.getRootNode() as Document | ShadowRoot).getElementById(this.anchor)` so it works inside shadow DOM.

4. **Future: `m-theme-switcher` persistence via syncdb** — Migrate from localStorage to `user_settings` CRDT table so theme preference syncs across devices. (Separate slice, not part of initial refactor.)

## Acceptance criteria

- [ ] `main-menu.ts` deleted, replaced by `m-main-menu` component following plop template pattern (lit-html, MElement, globalStyleSheet + baseStyleSheet)
- [ ] `m-main-menu` renders auth button reactively via `authClient.onAuthChange`
- [ ] `m-theme-switcher` extracted to `packages/components/`, works standalone
- [ ] `m-popover-menu` anchor lookup uses `getRootNode()` (shadow DOM compatible)
- [ ] Menu styles from `main.css` moved into component CSS
- [ ] `index.html` simplified to just `<m-main-menu></m-main-menu>` + `<main id="app">`
- [ ] Existing behavior preserved: theme switching, auth buttons, mobile/desktop responsive layout, popover menus

## Blocked by

- None - can start immediately (current auth refactor is complete)

## Design decisions to preserve

- `m-main-menu` owns all rendering — no orphaned HTML in index.html
- Auth-dependent UI uses pure template functions, not sub-components
- Theme switcher is a separate reusable component (not golf-specific)
- syncdb theme sync is a follow-up, not part of this issue
