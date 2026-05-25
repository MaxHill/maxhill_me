# Co-locate section disabled logic with section registry
Status: done
Priority: medium
Type: AFK

## What to build
The `disabledSections` record in the component page template manually maps section IDs to "has content?" boolean conditions, duplicating the IDs already defined in `sections.ts`. Add an optional `hasContent` callback (or similar) to each section definition in the registry so that determining whether a section is disabled is fully self-contained in one place. The component page template should derive its disabled state from the registry rather than maintaining a parallel mapping.

## Acceptance criteria
- [ ] Section registry entries can express a "has content?" predicate
- [ ] Component page template derives disabled tabs from the registry (no manual ID duplication)
- [ ] Adding a new section only requires editing `sections.ts` (single-touch)
- [ ] No behavioral change to the rendered page

## Blocked by
None - can start immediately
