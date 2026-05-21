Status: ready-for-agent

# Consolidate CEM data utility into single-parse architecture

## What to build

`get-component-data.ts` has multiple functions that each independently traverse untyped CEM utility output with pervasive `as any` casts. If `@wc-toolkit/cem-utilities` changes its output shape, every function breaks independently.

Refactor to a single-parse architecture: one function reads and validates the raw CEM JSON into a fully-typed `ComponentData[]` array at module load time. All accessor functions (`getComponentData`, `getAllComponents`, `getAllComponentTagNames`) become trivial lookups into this pre-parsed collection. The `as any` casts are concentrated in the single parse step.

## Acceptance criteria

- [ ] CEM JSON is parsed and validated exactly once at module load
- [ ] `as any` casts exist only in the parse/validation layer, not in accessor functions
- [ ] All existing callers (`[component].astro`, `index.astro`, `ComponentsLayout.astro`) continue to work without changes
- [ ] The `ComponentData` type accurately represents all fields (properties, methods, events, slots, cssParts, description, formAssociated, tagName)
- [ ] Events without names are still filtered out; empty descriptions still return ""
- [ ] Build passes

## Blocked by

None - can start immediately
