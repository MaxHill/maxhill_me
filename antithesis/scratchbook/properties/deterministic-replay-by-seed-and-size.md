## Property

Given same entropy stream (`seed`,`size`), replay should reproduce same pass/fail outcome.

## Evidence trail

- `sim/Driver.ml`: `entropy_of_seed` deterministic PRNG bytes; `run_once` consumes provided entropy.
- `sim_bin/simulator.ml`: `replay` command uses exact seed+size.

## Failure scenario

Nondeterministic behavior prevents reproducing counterexamples.

## Instrumentation suggestions

- Workload-side `Always`: rerun same seed/size N times => identical outcome classification.
- Optional `Reachable` markers on deterministic setup path.

Status vs existing instrumentation: **missing**.

## Open Questions

None.