# Handoff: Sync Simulator — Fix and Complete Implementation

## Context

The user implemented the PBT/test-case-minimization library from matklad's article:
https://matklad.github.io/2026/04/20/test-case-minimization.html

Reference gist: https://gist.github.com/matklad/343d13547c8bfe9af310e2ca2fbfe109

The code lives at `/Users/8717/code/personal/maxhill_me/sync-simulator`. It's a Zig project (check `mise.local.toml` for version — likely needs Zig 0.15+ nightly for the new `std.Io`/`std.process.Init` APIs used in the article).

## What's Done

- `src/FRNG.zig` — mostly complete but has bugs (see below)
- `src/main.zig` — skeleton with World struct and main, but broken
- `src/root.zig` — re-exports FRNG
- `build.zig` — standard template, builds one executable + library module

## What Needs Fixing

### FRNG.zig bugs (compare against gist)

| Line | Issue |
|------|-------|
| 7 | Error is `OutOfEntropyError`, should be `OutOfEntropy` |
| 15 | `bytes` returns `Error![size]u8` (invalid — size is runtime). Should return `Error![]const u8`. Also `frng` param should be `*FRNG` not value. |
| 16 | `frng.entropy < size` → `frng.entropy.len < size` |
| 65 | `comptime (expr);` is a no-op. Needs `comptime assert(...)` |
| 66 | `assert(min < max)` → `assert(min <= max)` |
| 179 | `run_multiple` switch arms discard results. `.fail` needs `return .{ .fail = seed }` |

### main.zig — structural problems

- `World.init` returns `!void` instead of `!World`
- `replicas: []type` — `type` isn't a runtime value; needs a real `Replica` struct
- `World.deinit(gpa)` called as static, should be `world.deinit(gpa)`
- `send_payload(replica: type, ...)` — first param should be `usize`
- `world.run()` doesn't exist; needs a step loop
- Two conflicting mains + `run_test` — architecture unclear

### Architecture gap

The article requires **two binaries**:

1. **SUT** (`main.zig`): reads entropy from stdin → FRNG → init World → loop step() → exit 0 or crash on assertion
2. **Driver** (new file, e.g. `src/driver_main.zig`): calls `FRNG.Driver.main()`, spawns SUT repeatedly, does binary search

`build.zig` needs updating to produce both executables.

### Missing domain logic

The World currently has no assertions that can fail — the driver will never find a bug. The user needs to add some invariant checking (even a toy one) so the system has something to detect.

## Suggested Next Steps

1. Fix all FRNG.zig bugs (mechanical — match the gist exactly)
2. Define a minimal `Replica` struct and fix World (init/deinit/step)
3. Add at least one assertable invariant in the simulation
4. Split main.zig into SUT main + driver main
5. Update build.zig for two executables
6. Verify: `head -c 1024 /dev/urandom | zig-out/bin/sync_simulator` exits 0
7. Verify: driver binary can search and find a minimal failure

## Suggested Skills

- **diagnose** — if build errors are tricky to resolve
- **tdd** — for verifying each fix incrementally with `zig build test`
