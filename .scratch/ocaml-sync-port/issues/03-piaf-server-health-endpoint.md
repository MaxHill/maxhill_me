---
Status: ready-for-agent
---

# Tracer bullet: Piaf server with `GET /health` and Logs setup

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Replace the hello-world `bin/main.ml` with a Piaf HTTP server running under `Eio_main.run`. The server listens on a port read from the `PORT` env var (default `3001` to match the Go server), serves a single endpoint `GET /health` that returns `200 OK` with body `ok`, and logs startup and request lines via the `Logs` library with the `Logs_fmt` reporter. Log level is read from the `LOG_LEVEL` env var.

A new `lib/server.ml` module owns the Piaf handler and route dispatch. `bin/main.ml` is the wiring: reads env vars, configures Logs, starts the server. This slice establishes the basic shape of every later slice: env → wiring in `main.ml` → behavior in `lib/`.

Routing is a hand-written pattern match on path inside one top-level handler — no routing framework — matching the style decision in the PRD.

## Acceptance criteria

- [ ] `lib/server.ml` exists and exposes a function that takes an `Eio` environment and starts the Piaf server
- [ ] `bin/main.ml` reads `PORT` (default 3001) and `LOG_LEVEL` from the environment and wires up Logs with `Logs_fmt`
- [ ] Each module that emits logs declares its own `Logs` source (at least `Server` in this slice)
- [ ] `pnpm --filter sync dev` starts the server and a startup log line is printed
- [ ] `curl http://localhost:3001/health` returns HTTP 200 with body `ok`
- [ ] An unknown path returns HTTP 404
- [ ] `pnpm --filter sync build` continues to succeed

## Blocked by

`.scratch/ocaml-sync-port/issues/02-bootstrap-ocaml-skeleton.md`
