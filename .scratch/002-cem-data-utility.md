# CEM data utility

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Parent

`.scratch/component-docs-page.md`

## What to build

A reusable utility module that wraps `@wc-toolkit/cem-utilities` and the `custom-elements.json` from `@maxhill/components`. It provides a clean interface for Astro pages to query component metadata without repeating the CEM boilerplate seen in the prototypes.

Interface: given a tag name, return a structured object containing: description (from JSDoc, markdown), properties (name, type, default, description), methods (name, type, description), events (name, detail type, description), slots (name, description), CSS parts (name, description), and metadata (form-associated boolean, slot count, prop count, event count).

Also provide a function to list all available component tag names (for building the sidebar/index).

## Acceptance criteria

- [ ] Utility module exists and can be imported by Astro pages
- [ ] Returns component description from CEM (JSDoc markdown)
- [ ] Returns public properties with name, type text, default, and description
- [ ] Returns public methods with name, type text, and description
- [ ] Returns events with name, detail type text, and description
- [ ] Returns slots with name and description
- [ ] Returns CSS parts with name and description
- [ ] Returns form-associated boolean
- [ ] Provides a list of all component tag names available in the CEM
- [ ] Handles missing/undefined fields gracefully (returns sensible defaults like empty arrays, "—" strings)

## Blocked by

None - can start immediately
