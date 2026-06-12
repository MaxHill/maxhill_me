# 0001 — Why `run_multiple` uses many attempts in DST

Date: 2026-06-11

## Context

While reviewing the searcher, the user asked: matklad does deterministic
simulation testing — so why does the searcher run the SUT 100× per size?
The agent had originally framed it as "defending against flaky tests,"
which is wrong for DST.

## Decision / Insight

`attempts` is **input space coverage at a fixed size**, not flakiness defense.

Two independent random axes:
1. Entropy bytes — drive the FRNG, drive SUT choices. SUT is deterministic
   given the bytes.
2. Seed — used by the searcher to *generate* a specific entropy buffer.

Fixing `(size, seed)` reproduces the run exactly. Fixing only `size` and
varying `seed` explores different points in the `2^(8·size)`-sized input
space. `run_multiple ~size ~attempts:100` asks: out of 100 random points
in the input space at this size, does any trigger the bug?

## Why this matters for minimization

Smaller `size` → exponentially smaller input space → failing inputs become
rarer, not more common. The minimization algorithm relies on randomly
stumbling into smaller failing examples, so each candidate size needs
enough seed samples to give a confident "no failing input here" verdict.

`attempts` is the budget for that confidence:
- More attempts → tighter minimum, more wall time.
- Fewer attempts → looser minimum, faster.

## Earlier framing (wrong)

The agent initially said `run_multiple` defends against non-deterministic
SUTs (race conditions, flaky tests). That's true for traditional fuzzing,
but the *point* of DST is to eliminate non-determinism. The right framing
is input-space coverage at a fixed size.
