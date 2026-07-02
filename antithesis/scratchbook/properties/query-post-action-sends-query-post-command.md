## Property

`Query_post` action in `World.step` must send `Client.Query_post`.

## Evidence trail

- `sim/sut/World.ml`: action enum includes `Query_post`; current branch sends `Client.Query_user` (likely bug).
- `sim/sut/test_client.js`: distinct handlers exist for `Query_user` and `Query_post`.

## Failure scenario

Post query path never exercised; simulator action coverage is biased and misleading.

## Instrumentation suggestions

- SUT-side `Always`: assert action->command mapping table correctness.
- Reachability marker proving `Query_post` handler in JS is hit.

Status vs existing instrumentation: **missing**.

## Open Questions

None.