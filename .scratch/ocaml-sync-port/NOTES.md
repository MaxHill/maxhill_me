# Teaching notes — OCaml + FRNG port

## User preferences
- Teach/guide only; user writes the code. Code examples allowed.
- Faithful port of matklad's article, but idiomatic OCaml when Zig features don't translate.
- Unbiased sampling (rejection sampling) preferred over biased modulo.
- **Never use emojis.** Plain text only.

## Lesson plan (completed 2026-06-13)
1. [done] Lift the int64 ceiling on `take_int_inclusive` / `weighted_pick`.
2. [done] Polymorphic variants detour — refactor `weighted_pick` to use them.
3. [done] The Searcher — subprocess spawning, stdin piping, doubling/halving binary search.
4. [done] Toy SUT (World) to bring it home.
5. [done] Bonus: swarm weights threaded through.

Lessons saved as HTML in `.scratch/lessons/`.
Learning records in `.scratch/learning-records/`.

## Article
https://matklad.github.io/2026/04/20/test-case-minimization.html

## Code location
`simulators/sync/lib/FRNG.{ml,mli}`
