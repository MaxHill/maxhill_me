# 0002 — Completion of FRNG port

Date: 2026-06-13

## What got built

A working test-case minimizer in OCaml, ported from matklad's article
(https://matklad.github.io/2026/04/20/test-case-minimization.html). Code
lives in `simulators/sync/`.

### `lib/FRNG.ml`
- Finite RNG over a fixed entropy buffer
- `take_int` (62-bit, 8-byte draw, masked + Int64.to_int)
- `take_int_inclusive` (unbiased rejection sampling against max_int)
- `take_range_inclusive`, `take_index`
- `weighted_pick` (polymorphic-variant friendly via `'a`)
- `swarm_weight_pick` (random per-option weights)

### `lib/Driver.ml`
- `run_once` — Unix.create_process + pipe + waitpid
  - **Critical**: `Unix.set_close_on_exec` on the parent's write end
    so the child loses it on exec → EOF actually fires
- `entropy_of_seed` — deterministic expansion of a seed via Random.State
- `fresh_seed` — non-deterministic seed via Random.self_init
- `run_multiple` — N attempts at a fixed size with fresh seeds
- `search` — doubling-up / halving-down minimization

### `lib/World.ml`
- Two-account ledger toy with planted bug (no balance check on transfer)
- Uses `swarm_weight_pick`-style weights via `init_weights`
- Asserts invariants every step

### `bin/sut.ml`
- Reads stdin entropy, runs World.run, exits 0 unless assertion fails

### `bin/main.ml`
- `replay --seed N --size N` — reproduce a known failure
- `search --attempts N --size_max N` — find minimum failing entropy

## Verified end-to-end

The searcher reliably finds the planted bug, minimizes to ~50-60 byte
entropy, and `replay` deterministically reproduces the same crash from
`(size, seed)`.

## OCaml concepts learned along the way

- Bits, bytes, hex, binary AND, masking
- Endianness (little vs big)
- OCaml's 63-bit int vs Int64.t, why a 2-bit mask is needed for the cast
- Unbiased rejection sampling
- Polymorphic variants (`` `Tag ``) vs regular variants
- Result.bind and `let* ` syntax
- `let` without parameters is a value (eager); with parameters is a
  function (lazy) — relevant to cmdliner handlers
- Module visibility within a dune library (no imports needed for
  siblings); cross-library access via `Library.Module`
- Unix subprocess pitfalls: fd inheritance + close-on-exec
- Cmdliner: `Term.const handler $ arg`, positional handlers, required args

## Open follow-ups (not blocking)

- `lib/FRNG.mli` is still stale; doesn't expose most of `.ml`
- No alcotest tests for FRNG primitives
- `swarm_weights` could log the drawn distribution for diagnostics
