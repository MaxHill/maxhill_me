## What to build

Add `.gitignore` rules to `apps/syncdb-server/` to exclude build artifacts and database files from version control. Remove the currently tracked files from git history (cached removal only — keep them on disk).

**Files to ignore:**
- `server` (compiled Go binary)
- `*.db` (SQLite databases: `sync.db`, `cmd/simulator/simulator.db`)

## Acceptance criteria

- [ ] `apps/syncdb-server/.gitignore` exists with entries for `server` and `*.db`
- [ ] `apps/syncdb-server/server`, `apps/syncdb-server/sync.db`, and `apps/syncdb-server/cmd/simulator/simulator.db` are removed from git tracking (`git rm --cached`)
- [ ] Files still exist on disk after removal from tracking
- [ ] Clean `git status` shows no untracked db/binary files

## Blocked by

None - can start immediately
