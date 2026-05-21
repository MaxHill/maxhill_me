# Remove redundant existsSync in example discovery
Status: done
Priority: medium
Type: AFK

## What to build
`getExamplesForComponent` calls `existsSync` before `readdirSync`/`readFileSync`, doubling filesystem syscalls for the common case (directory exists). Replace with a try/catch around the read operations that returns an empty array on `ENOENT`, eliminating the redundant stat call.

## Acceptance criteria
- [ ] `existsSync` call removed from example discovery utility
- [ ] Missing directories handled via try/catch returning empty array
- [ ] No behavioral change (missing dir still returns empty examples list)

## Blocked by
None - can start immediately
