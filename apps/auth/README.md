# @maxhill/auth

OpenAuth-based authentication service for maxhill.me.

Runs as a long-running Bun-compiled binary on the VPS. Storage is
SQLite; email delivery is Resend. Follows the standard on-box config
convention (see [`docs/vps.md`](../../docs/vps.md)): one JSON config
path passed as an argument, no environment variables.

## Layout

```
apps/auth/
├── src/
│   ├── index.ts           entry point + subcommands
│   ├── config.ts          JSON config parser (valibot)
│   ├── sqlite-storage.ts  StorageAdapter over bun:sqlite
│   └── subjects.ts        JWT subject definitions (exportable)
└── package.json
```

Systemd units live under `vps/auth/`:

- `auth.service` — the long-running server.
- `auth-sweep.service` + `auth-sweep.timer` — hourly `DELETE` of
  expired KV rows. Enabled once by `bootstrap.sh`.

## CLI

```
auth-exe run   <config-path>   # start the HTTP server on :8081
auth-exe sweep <config-path>   # DELETE expired rows, exit 0
```

Both subcommands read the same config file. The `sweep` subcommand is
invoked by `auth-sweep.timer`; `run` is invoked by `auth.service`.

## Config

```json
{
  "issuer": "https://auth.maxhill.me",
  "dbPath": "/var/lib/auth/auth.db",
  "resendApiKey": "re_…"
}
```

- **`issuer`** — public URL announced in OAuth discovery and baked
  into issued tokens.
- **`dbPath`** — SQLite file. On prod this is under the systemd
  `StateDirectory=auth`, i.e. `/var/lib/auth/`.
- **`resendApiKey`** — Resend API key used to send verification codes.
  `from` address is hardcoded to `auth@maxhill.me`.

Port (8081), email `from` address, and the schema itself are code-side
constants. If any of them need to vary per environment, promote them
into the config schema — don't reach for env vars.

## Local development

Create `vps/auth/auth.dev.json` (gitignored — see the root
`.gitignore`) with a real Resend API key. Use `:memory:` for the DB so
state resets on every restart:

```json
{
  "issuer": "http://localhost:8081",
  "dbPath": ":memory:",
  "resendApiKey": "re_…"
}
```

Swap in a file path (e.g. `./auth.dev.db`) if you want state to
survive restarts.

Then:

```bash
cd apps/auth
pnpm install
pnpm dev
```

`pnpm dev` runs `bun --watch src/index.ts run
../../vps/auth/auth.dev.json` — same code path as production, only the
config path differs.

Discovery endpoint: <http://localhost:8081/.well-known/oauth-authorization-server>.

## Production deploy

`mise run deploy:auth` from the repo root. See `vps/auth/deploy.sh`:
it builds the binary with `bun build --compile
--target=bun-linux-x64`, rsyncs the artifact plus
`vps/auth/auth.prod.enc.json`, decrypts the config on the box via
sops, atomically swaps the `/opt/auth/current` symlink, and restarts
`auth.service`.

Rotating `resendApiKey` (or any prod config key): edit the plaintext,
re-encrypt with sops, commit, redeploy. Full flow in `docs/vps.md`.

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
