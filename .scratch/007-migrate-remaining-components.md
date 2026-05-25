# Migrate remaining 14 components to examples format

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Parent

`.scratch/component-docs-page.md`

## What to build

Migrate the remaining 14 components to the new documentation format. For each component in `packages/components/src/`:

1. If it has existing `DOCS.mdx` or `/docs/` folder, convert examples to `/examples/` format (numbered folders with raw HTML/CSS/JS)
2. Ensure JSDoc on the component class contains the full description (overview + keyboard nav info if applicable)
3. Delete `DOCS.mdx` and `/docs/` folder
4. If a component has no existing docs beyond CEM data, create at minimum a `01-basic-usage/index.html` example

Components to migrate: `m-card`, `m-combobox`, `m-command`, `m-command-palette`, `m-copy-button`, `m-fit-text`, `m-input`, `m-listbox`, `m-option`, `m-popover-menu`, `m-search-list`, `m-tab`, `m-tab-panel`, `m-textarea`.

## Acceptance criteria

- [ ] All 14 components have an `/examples/` folder with at least one example
- [ ] Each example has a valid `index.html`
- [ ] All `DOCS.mdx` files are deleted
- [ ] All `/docs/` folders are deleted
- [ ] JSDoc descriptions are complete for all components
- [ ] CEM generates correctly for all components
- [ ] All component pages render at `/components/{tag-name}` with real data

## Blocked by

- `.scratch/005-component-page-template.md`
