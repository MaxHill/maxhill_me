# Teaching notes — OCaml + FRNG port

## User preferences
- Teach/guide only; user writes the code. Code examples allowed.
- Faithful port of matklad's article, but idiomatic OCaml when Zig features don't translate.
- Unbiased sampling (rejection sampling) preferred over biased modulo.

## Lesson plan (chosen 2026-06-09)
1. Lift the int64 ceiling on `take_int_inclusive` / `weighted_pick`.
2. Polymorphic variants detour — refactor `weighted_pick` to use them.
3. The Searcher — subprocess spawning, stdin piping, doubling/halving binary search.
4. Toy SUT (World) to bring it home.

## Article
https://matklad.github.io/2026/04/20/test-case-minimization.html

## Code location
`simulators/sync/lib/FRNG.{ml,mli}`
