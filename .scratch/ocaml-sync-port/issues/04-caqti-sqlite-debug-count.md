---
Status: ready-for-agent
---

# Caqti SQLite wiring: schema init + `GET /debug/count`

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Add the `Repository` module backed by Caqti + `caqti-driver-sqlite3` + `caqti-eio`. On server boot, open a Caqti connection pool against a SQLite database path read from an env var (e.g. `DB_PATH`, defaulting to `./sync.db` to match the Go server), initialize the schema (the `crdt_operations` table and its indexes, identical to the Go schema), and expose the pool to the HTTP layer.

Expose a single read query in this slice: `count_operations`, returning the number of rows in `crdt_operations`. Wire it to a new `GET /debug/count` endpoint that returns the count as a JSON body (`{"count": N}`) or plain text.

Connection pool is sized to 20 concurrent connections to match the Go server's `db.SetMaxOpenConns(20)`.

The Repository module's public interface should accept a Caqti connection-pool handle (or the equivalent transaction handle), not construct one internally. `bin/main.ml` owns pool construction; `lib/repository.ml` owns the queries.

## Acceptance criteria

- [ ] `lib/repository.ml` exists and exposes (at minimum) a schema-init function and a `count_operations` function, both taking a Caqti connection / pool handle
- [ ] The schema created matches the Go server's `Schema` constant exactly (same columns, same indexes, same `UNIQUE(client_id, version)` constraint)
- [ ] `bin/main.ml` reads `DB_PATH` (default `./sync.db`), opens a Caqti pool sized to 20, runs schema init, and hands the pool to the server
- [ ] `GET /debug/count` returns the current row count of `crdt_operations`
- [ ] Starting the server against an existing Go-produced `sync.db` works without migration and reports the correct existing row count
- [ ] Caqti errors surface as HTTP 500 with a logged error (no silent failures)
- [ ] `pnpm --filter sync build` and `pnpm --filter sync dev` succeed

## Blocked by

`.scratch/ocaml-sync-port/issues/03-piaf-server-health-endpoint.md`
