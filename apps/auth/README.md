# @maxhill/auth

OpenAuth-based authentication service for maxhill.me.

Runs as a long-running Bun-compiled binary on the VPS. Storage is
SQLite; email delivery is Resend. Follows the standard on-box config
convention (see [`docs/vps.md`](../../docs/vps.md)): systemd loads a
dotenv file with `EnvironmentFile=` and the binary reads
`process.env`.

## Layout

```
apps/auth/
├── src/
│   ├── index.ts           entry point + subcommands
│   ├── config.ts          env-var parser (valibot)
│   ├── sqlite-storage.ts  StorageAdapter over bun:sqlite
│   └── subjects.ts        JWT subject definitions (exportable)
└── package.json
```

Systemd units live under `vps/auth/`:

- `auth.service` — the long-running server.
- `auth-sweep.service` + `auth-sweep.timer` — hourly `DELETE` of
  expired KV rows. Enabled once by bootstrap.

## CLI

```
auth-exe run     # start the HTTP server on :3002
auth-exe sweep   # DELETE expired rows, exit 0
```

Both subcommands read the same env vars. `sweep` is invoked by
`auth-sweep.timer`; `run` is invoked by `auth.service`.

## Config

Read from `process.env`:

- **`ISSUER`** — public URL announced in OAuth discovery and baked
  into issued tokens.
- **`DB_PATH`** — SQLite file. On prod this is under the systemd
  `StateDirectory=auth`, i.e. `/var/lib/auth/`.
- **`RESEND_API_KEY`** — Resend API key used to send verification codes.
  `from` address is hardcoded to `auth@maxhill.me`.

Port (3002), email `from` address, and the schema itself are code-side
constants. If any of them need to vary per environment, promote them
into the env schema.

## Local development

Create `vps/auth/auth.dev.env` (gitignored) with a real Resend API
key. Use `:memory:` for the DB so state resets on every restart:

```
ISSUER=http://localhost:3002
DB_PATH=:memory:
RESEND_API_KEY=re_…
```

Swap in a file path (e.g. `./auth.dev.db`) if you want state to
survive restarts.

`apps/auth/mise.toml` loads that file via `[env]._.file`. Run
dev from anywhere:

```bash
cd apps/auth && mise run run
```

Same code path as production, only the env source differs.

Discovery endpoint: <http://localhost:3002/.well-known/oauth-authorization-server>.

## Production deploy

`mise run deploy:auth` from the repo root. See `vps/auth/deploy.ts`:
it builds the binary with `bun build --compile
--target=bun-linux-x64`, compiles and ships `deploy-remote.ts`, rsyncs
artifact + encrypted env, then the remote deploy binary decrypts to
`/etc/auth/auth.prod.env`, atomically swaps `/opt/auth/current`, and
restarts `auth.service`.

Rotating `RESEND_API_KEY` (or any prod env var): `sops edit
vps/auth/auth.prod.enc.env`, commit, redeploy. Full flow in
`docs/vps.md`.

## Storage schema

Single table, keyed by OpenAuth's 0x1F-joined string key:

```sql
CREATE TABLE kv (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,        -- JSON.stringify(value)
  expiry INTEGER                -- unix ms; NULL means no expiry
);
CREATE INDEX kv_expiry ON kv(expiry) WHERE expiry IS NOT NULL;
```

`get` and `scan` skip expired rows lazily; `auth-exe sweep` reclaims
their disk hourly. `PRAGMA journal_mode=WAL` is set at open (required
for the deferred Litestream backup plan in `docs/vps.md`).

## User IDs

`getOrCreateUser` currently returns a deterministic SHA-256 hash of
the email. This is a placeholder — swap it for a call to a real user
service when one exists.

## Client usage

```ts
import { subjects } from "@maxhill/auth/subjects"
import { createClient } from "@openauthjs/openauth/client"

const client = createClient({
  clientID: "my-app",
  issuer: "https://auth.maxhill.me",
})

const verified = await client.verify(subjects, accessToken, { refresh: refreshToken })
if (!verified.err) {
  console.log(verified.subject) // { type: "user", properties: { userID: "..." } }
}
```
