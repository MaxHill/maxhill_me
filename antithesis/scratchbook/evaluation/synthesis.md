---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Categorized findings

### Refinement

1. **Concern:** action-routing correctness gap in simulator queries.
   - **Evidence:** wildcard + coverage lens found `Query_post` path mapped to `Client.Query_user` in `sim/sut/World.ml`.
   - **Action taken:** added property `query-post-action-sends-query-post-command` and evidence file.

2. **Concern:** lifecycle fallback branch underrepresented.
   - **Evidence:** implementability + antithesis-fit flagged strong value in close-timeout force-kill path.
   - **Action taken:** retained explicit property `graceful-close-timeout-forces-kill`; deployment doc notes node-termination fault requirement.

3. **Concern:** one reachability property weak Antithesis leverage.
   - **Evidence:** antithesis-fit lens on `simulator-uses-single-db-connection-for-schema-visibility`.
   - **Action taken:** kept property but treated as lower-priority scaffolding check during workload budgeting.

### Gap

1. **Concern:** semantic convergence checks are thin (mostly protocol-level checks today).
   - **Evidence:** coverage and wildcard lenses note `check_properties` currently `assert true`.
   - **Action taken:** documented as next expansion area; no immediate catalog addition because current code lacks semantic oracle hooks.

### Bias (needs human judgment)

1. **Concern:** portfolio intentionally simulator-centric, not production HTTP service-centric.
   - **Evidence:** scope answer constrained run to `@apps/sync/` simulator focus.
   - **Judgment needed:** confirm whether next pass should stay simulator-only or expand to full server topology/properties.

## Net result

- Catalog remains 15 properties.
- Refinements applied directly in catalog/relationships/deployment docs.
- No property invalidated.
- Open questions remain empty at property level for this pass.
