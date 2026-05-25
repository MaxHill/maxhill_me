# Delete prototypes and old content collections

- **Status**: ready-for-agent
- **Created**: 2026-05-20

## Parent

`.scratch/component-docs-page.md`

## What to build

Clean up deprecated code once all components are migrated:

1. Delete all prototype files: `prototype-v1.astro` through `prototype-v6.astro` from `apps/site/src/pages/components/`
2. Remove Astro content collection configurations for `componentDocs`, `componentOverview`, `componentExamples`, `componentKeyboard`
3. Remove any content collection source directories that are now empty
4. Verify the site builds cleanly with no references to deleted files

## Acceptance criteria

- [ ] All `prototype-v*.astro` files are deleted
- [ ] Content collection configs for component docs are removed
- [ ] No dead imports or references to removed collections
- [ ] Site builds successfully (`npm run build` or equivalent)
- [ ] `/components/m-tab-list` (and other component pages) still work correctly

## Blocked by

- `.scratch/007-migrate-remaining-components.md`
