---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Findings

1. Most properties are implementable workload-side using simulator command protocol and process exit status checks.
2. Some properties benefit from SUT-side assertions for precision:
   - duplicate-dot mismatch path
   - graceful-close timeout branch
   - request transaction rollback verification
3. Crash/restart flavored checks need node-termination faults enabled; not always default.

## Passes

- Deployment plan is minimal and sufficient for current simulator architecture.

## Uncertainties

- If environment forbids child process spawning, current simulator model needs packaging adjustments.