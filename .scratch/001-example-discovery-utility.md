# Example discovery utility

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Parent

`.scratch/component-docs-page.md`

## What to build

A build-time utility function that discovers and reads component examples from the filesystem. It globs `packages/components/src/*/examples/*/`, reads file contents (`index.html`, optional `index.css`, `index.js`, `explanation.md`), and returns structured data per component.

Interface: given a component tag name (e.g., `m-tab-list`), return an ordered array of examples. Each example has: slug (folder name without numeric prefix), order (from numeric prefix), html content, optional css content, optional js content, optional explanation markdown. The function should also support returning examples for all components at once (for building the sidebar/index).

Examples are ordered by their numeric prefix (`01-basic-usage` comes before `02-disabled-tabs`). The numeric prefix is stripped from the display slug.

## Acceptance criteria

- [ ] Utility function exists and can be imported by Astro pages
- [ ] Correctly discovers example folders across all components that have them
- [ ] Returns `index.html` content for each example
- [ ] Returns `index.css`, `index.js`, `explanation.md` content when present, undefined when absent
- [ ] Examples are sorted by numeric prefix
- [ ] Slug is derived from folder name with numeric prefix stripped (e.g., `01-basic-usage` → `basic-usage`)
- [ ] Handles components with no `/examples/` folder gracefully (returns empty array)

## Blocked by

None - can start immediately
