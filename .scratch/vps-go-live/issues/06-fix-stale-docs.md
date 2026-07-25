---
Status: done
---

# Fix stale docs before go-live

## What to build

Several docs are out of date relative to the current code and the impending VPS launch. Fix them so a newcomer (or future maintainer) reading the docs sees reality.

Known drift:

1. **`docs/vps.md` "Prerequisites"** — lists "`apps/auth` migrated off Cloudflare Workers" as an outstanding item. It isn't; `apps/auth/src/index.ts` is already Bun + `@openauthjs/openauth`, and there is no `wrangler.toml`. Drop this bullet (leave the Resend bullet).

2. **`docs/prd-golf-auth.md`** — refers to "the Go sync server" and the sync-server middleware being written in Go (`github.com/lestrrat-go/jwx`). The sync server is now OCaml (Piaf + Jose); `apps/sync/lib/auth.ml` implements JWKS validation. Update the PRD to reflect OCaml/Jose, without rewriting the whole doc — just correct the language references.

3. **`docs/agents/*.md`** — sweep for stale references (e.g. mentions of `sync_go`, `wrangler`, Cloudflare Workers, or anything else that assumes the old architecture). Fix in place.

4. **`docs/vps.md`** — while you're in there, sweep for any other drift the other B-slice issues (`01`–`05`) introduce or expose. In particular, once issue `01` reshapes alert-on-failure, this file's "Repo layout" and "Alarms" sections need to reflect the new deploy-based flow. (If those edits happen inside issue `01`, this slice can skip them and just note it.)

## Acceptance criteria

- [ ] `docs/vps.md` no longer lists the auth-off-Workers prerequisite
- [ ] `docs/prd-golf-auth.md` no longer refers to a Go sync server or the Go `jwx` library; language is corrected to OCaml + Jose
- [ ] `docs/agents/*.md` has been read end-to-end; any references to superseded architecture are fixed or explicitly flagged in the issue comments as intentional (e.g. historical context)
- [ ] `grep -rni "wrangler\|cloudflare workers\|sync_go\|lestrrat" docs/` returns no unintended matches (a match inside a "history" or "why we changed" section is OK if intentional)
- [ ] `docs/vps.md` reads consistently with the state of `vps/` and `bootstrap.sh` after issues `01`–`05` land — if this issue is picked up before those merge, note the dependency in comments and land the doc pass afterward

## Blocked by

None strictly, but best landed after issues `01` and `05` merge, since both touch `docs/vps.md` layout/config sections.
