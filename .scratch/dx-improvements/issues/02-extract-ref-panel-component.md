# Extract RefPanel component for API reference panels
Status: done
Priority: medium
Type: AFK

## What to build
Six API panels (properties, methods, events, slots, css-parts, overview description) follow the same pattern: a heading, a definition list with term/description pairs, and conditional "none" fallback text. Extract a reusable Astro component (e.g. `RefPanel.astro`) that accepts a title, items array, and empty-state message, then use it in the component page template to replace the repeated markup.

## Acceptance criteria
- [ ] A reusable `RefPanel.astro` (or similar) component exists
- [ ] All API reference panels in the component page use it
- [ ] No visual or behavioral change to the rendered page
- [ ] Adding a new API panel requires only a new `RefPanel` invocation with data

## Blocked by
None - can start immediately
