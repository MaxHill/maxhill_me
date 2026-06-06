---
Status: done
---

# Preserve int64 wire values and linearize sync hashing

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Improve wire-level robustness and hot-path performance in sync hashing.

Decode version-like fields as full 64-bit values without routing through platform `int`, and refactor request/response hash builders to linear-time construction (avoid repeated list-appends). Maintain hash parity with Go for existing covered cases.

## Acceptance criteria

- [ ] JSON decoding for `version` and `lastSeenServerVersion` preserves 64-bit values safely
- [ ] Hash generation path avoids quadratic append behavior on large operation lists
- [ ] Existing hash parity expectations remain unchanged for empty/set/setRow/remove covered scenarios
- [ ] Response/request hash validation behavior remains functionally identical to current behavior
- [ ] `pnpm --filter sync build` and test suite pass

## Blocked by

None - can start immediately
