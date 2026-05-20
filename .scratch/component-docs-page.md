# Component Documentation Page

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Problem Statement

The current `/components` page is a blog-style documentation layout that requires reading through articles to find API information. Developers switching back from their editor need to find a specific prop type, event name, or usage example in under 3 seconds. The current format doesn't support that workflow.

Additionally, the component documentation in `packages/components/` is coupled to Astro/MDX via cross-package imports, making examples untestable in isolation and the docs format unnecessarily complex.

## Solution

Replace the `/components` page with a keyboard-driven, TUI-inspired component reference tool. Each component gets its own route (`/components/{component_name}`) with a persistent sidebar for navigation and tabbed sections for API categories.

Migrate component documentation to a simple file-based format: JSDoc for overview/description (via Custom Elements Manifest), and raw HTML/CSS/JS example folders that are framework-agnostic and independently runnable.

## User Stories

1. As a developer, I want to navigate to `/components/m-tab-list` and immediately see the component's description and basic usage, so that I can quickly understand what it does.
2. As a developer, I want to switch between API sections (properties, events, slots) via tabs, so that I can find specific API information fast.
3. As a developer, I want empty sections (e.g., no CSS parts) to be visibly disabled rather than hidden, so that I know the section exists but has no content.
4. As a developer, I want to use a leader key (`C-b`) followed by a letter to jump between tabs without using the mouse, so that I stay in a keyboard-driven workflow.
5. As a developer, I want a command palette (`C-b space`) that fuzzy-filters component names, so that I can jump to any component instantly.
6. As a developer, I want the sidebar to list all components as normal links, so that I can navigate with standard browser behavior (middle-click, back/forward).
7. As a developer, I want a statusbar showing available keyboard shortcuts, so that I can discover and remember the key bindings.
8. As a developer, I want to see live rendered examples with their source code on the examples tab, so that I can copy patterns directly.
9. As a developer, I want example explanations to appear above the live preview, so that I have context before seeing the result.
10. As a developer, I want tab switching to use a terminal wipe transition, so that the interface feels responsive and intentional.
11. As a developer on mobile, I want the sidebar to appear as an overlay when toggled, so that I can still navigate components on smaller screens.
12. As a component author, I want to write examples as plain HTML/CSS/JS files without MDX or framework imports, so that examples are simple to create and testable in isolation.
13. As a component author, I want the component description to live in JSDoc (single source of truth via CEM), so that I don't maintain duplicate documentation.
14. As a component author, I want example ordering controlled by numeric folder prefixes, so that I can control display order without a manifest file.
15. As a component author, I want only `index.html` to be required per example, with CSS/JS/explanation optional, so that simple examples stay simple.

## Implementation Decisions

- **Routing**: Each component gets a static Astro page at `/components/[component_name]`. Navigation between components is standard `<a>` links (no client-side router).
- **Data sources**: API data (properties, methods, events, slots, CSS parts, description) comes exclusively from `custom-elements.json` (CEM). Examples come from the filesystem at build time.
- **Example format**: Each component has an `/examples/` folder at `packages/components/src/{component}/examples/`. Each example is a folder with a numeric-prefix slug (e.g., `01-basic-usage/`). Only `index.html` is required; `index.css`, `index.js`, and `explanation.md` are optional.
- **Example rendering**: Astro reads example file contents at build time and passes them as props to the existing `CodeExample` component. Examples render directly in the page (no iframes, no shadow DOM isolation).
- **Tab structure**: Tabs are: overview, examples, properties, methods, events, slots, css parts. Tabs with no data are disabled (not hidden). The overview tab shows the CEM description plus the first example. The examples tab shows all examples except the first (to avoid duplication).
- **Sidebar**: Always visible on desktop (220px). On mobile, hidden by default, shown as an overlay (no slide animation) via a toggle button.
- **Statusbar**: A dedicated Astro component. Displays the leader key prefix and available shortcuts contextually. Includes the blinking cursor aesthetic from the prototype.
- **Leader key**: `C-b` activates leader mode. Subsequent keys switch tabs (`o` overview, `x` examples, `p` properties, `m` methods, `e` events, `s` slots, `c` css parts) or open the command palette (`space`). No `j`/`k` component navigation.
- **Command palette**: Uses existing `m-command-palette` component as-is. Searches component names only (no deep API member search).
- **Tab-list transition**: Uses `m-tab-list` with `transition="terminal-wipe"` for panel switching.
- **Layout component**: A shared Astro layout for all `/components/*` pages containing the sidebar, statusbar, mobile toggle, and leader key script.
- **Example discovery utility**: A build-time function that globs `packages/components/src/*/examples/*/`, reads file contents, and returns structured example data per component.
- **CEM data utility**: A reusable module wrapping `@wc-toolkit/cem-utilities` to return structured component data (description, properties, methods, events, slots, CSS parts, form-associated status).
- **Migration**: Delete `DOCS.mdx` and the `/docs/` folder per component as it's migrated. Start with `m-tab-list`, then migrate the remaining 14 components.
- **Prototype cleanup**: Delete all `prototype-v*.astro` files once the first real component page is working.

## Testing Decisions

No automated tests for this feature. The modules are straightforward build-time utilities and Astro templates. Verification is visual — check the running site at localhost:4321.

## Out of Scope

- Client-side navigation / SPA behavior (fetch + DOM swap) — deferred to a future enhancement
- Deep search into API members via command palette
- Improvements to `m-command-palette` component
- Spring-physics sidebar cursor animation
- CRT boot sequence
- Mobile-optimized layout beyond basic sidebar overlay
- Persisting last-viewed component/section in localStorage

## Further Notes

- The prototype v5 (`apps/site/src/pages/components/prototype-v5.astro`) serves as the primary visual reference for the final implementation.
- The existing Astro content collections for component docs (`componentDocs`, `componentOverview`, `componentExamples`, `componentKeyboard`) should be removed once all components are migrated.
- JSDoc in component source files should support multi-paragraph markdown for components that need richer overview content (the CEM already parses this).
