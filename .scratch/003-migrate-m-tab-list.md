# Migrate m-tab-list to examples format

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Parent

`.scratch/component-docs-page.md`

## What to build

Convert `m-tab-list`'s existing documentation into the new format:

1. Create `/examples/` folder at `packages/components/src/m-tab-list/examples/`
2. Convert each example from the existing `DOCS.mdx` and `docs/examples.mdx` into its own numbered folder with raw HTML (and optional CSS/JS/explanation.md)
3. Ensure the JSDoc on the `m-tab-list` class contains the full component description (including keyboard navigation info that was previously in `docs/keyboard.mdx`)
4. Delete `DOCS.mdx` and the `docs/` folder

Expected example folders based on existing content:
- `01-basic-usage/` — horizontal tabs
- `02-bottom-position/`
- `03-vertical-layout/`
- `04-disabled-tabs/`
- `05-terminal-wipe-transition/`
- `06-event-listening/` (needs `index.js` + explanation)

## Acceptance criteria

- [ ] `packages/components/src/m-tab-list/examples/` folder exists with numbered example subfolders
- [ ] Each example has at minimum an `index.html` that is a valid, runnable snippet
- [ ] Examples that need JS have an `index.js` file
- [ ] At least one example has an `explanation.md`
- [ ] JSDoc on the m-tab-list class contains the component overview description including keyboard navigation docs
- [ ] `DOCS.mdx` is deleted
- [ ] `docs/` folder is deleted
- [ ] CEM still generates correctly (run the manifest build and verify description appears)

## Blocked by

None - can start immediately
