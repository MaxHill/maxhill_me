---
Status: ready-for-agent
---

# OCaml port of the sync server (experiment)

## Problem Statement

The current sync server (`apps/sync/`) is written in Go. The maintainer prefers OCaml as a language and believes the CRDT operation domain — specifically `CRDTOperation`, which is currently a flat struct with optional fields gated by a `type` discriminator string — would be expressed more clearly as an OCaml sum type, eliminating a class of runtime "is this field set for this op type?" checks at compile time. This is a side experiment driven by maintainer preference plus a real modeling itch, not a business-critical migration. The risk to manage is that the port stalls half-finished with no learning extracted and no clean rollback path.

## Solution

Port the sync server from Go to OCaml on the current experiment branch, in a sibling directory, while keeping the Go implementation buildable and runnable as the parity oracle.

Concretely:

- Rename `apps/sync/` → `apps/sync_go/` (mechanical commit).
- Create a new `apps/sync/` containing the OCaml port.
- Build on OCaml 5 + Eio (direct-style concurrency), Piaf (HTTP), Caqti + caqti-driver-sqlite3 (DB), yojson + ppx_yojson_conv (JSON), jose (JWT).
- Model `CRDTOperation` as a polymorphic-variant payload behind shared metadata, with a hand-written JSON codec at the wire boundary that preserves the exact Go wire format.
- "Done" = all listed modules ported, `pnpm --filter sync dev` starts the OCaml server cleanly, and the maintainer's manual sanity checks against the running server confirm equivalent behavior to the Go server for the scenarios they care about.
- The Go server on `main` is untouched throughout the experiment, so abandoning the branch is the rollback.

## User Stories

1. As the maintainer, I want the sync server written in OCaml, so that I enjoy working on it more and ship maintenance changes faster.
2. As the maintainer, I want `CRDTOperation` modeled as a sum type, so that the compiler rejects illegal combinations of `type` and payload fields instead of relying on runtime checks.
3. As the maintainer, I want a pattern-match on op type in `Sync_engine` that the compiler forces me to keep exhaustive, so that adding a new CRDT op kind cannot silently miss a handler.
4. As the maintainer, I want the Go implementation to remain runnable side-by-side during the port, so that I can diff behavior and consult it as a reference spec.
5. As the maintainer, I want the OCaml server's wire format (request and response JSON shape, including `responseHash` derivation) to be byte-compatible with the Go server's, so that existing and future clients are unaffected by the language switch.
6. As the maintainer, I want SQLite schema and data layout unchanged, so that an existing `sync.db` file works against either binary without migration.
7. As the maintainer, I want JWT validation behavior (JWKS-fetched, cached, periodically refreshed) to match the Go implementation, so that production auth integration is unchanged.
8. As the maintainer, I want the OCaml app to expose normal `build`/`dev`/`test` scripts in its `package.json`, so that turbo and pnpm treat it like any other workspace package and I don't have a parallel build invocation to remember.
9. As the maintainer, I want a per-project local opam switch (`_opam/` inside the app directory), so that the OCaml toolchain version is pinned per-app and doesn't conflict with future OCaml projects.
10. As the maintainer, I want exceptions caught at the HTTP boundary and converted to status codes, so that I write straight-line Eio code without `let*` plumbing and `Result.t` wrappers throughout the request path.
11. As the maintainer, I want structured logging via the `Logs` library with per-module sources, so that I can raise the verbosity of one subsystem at a time via env var.
12. As the maintainer, I want `Sync_engine` to be a pure domain module with no Caqti or Piaf knowledge, so that the CRDT logic is testable in isolation when tests come back on the table.
13. As the maintainer, I want `Auth` to expose a single `validate_bearer` entrypoint and hide the JWKS fetch/cache/refresh fiber internally, so that the HTTP handler doesn't see those mechanics.
14. As the maintainer, I want the OCaml `apps/sync/` directory to follow conventional OCaml project layout (`dune-project`, `bin/`, `lib/`, `_opam/` in `.gitignore`), so that any OCaml developer reading the repo recognizes the structure.
15. As the maintainer, I want the rename of `apps/sync/` → `apps/sync_go/` to be a single mechanical commit isolated from any OCaml code, so that the diff is reviewable and easy to revert if the experiment is abandoned.
16. As the maintainer, if I abandon the experiment, I want rollback to be `git checkout main` (and optionally deleting the branch), so that there is no cleanup work and no risk to the production Go server.
17. As the maintainer, I want the OCaml server to read the same env vars the Go server reads (`AUTH_ISSUER_URL`, server port, DB path), so that local dev workflows don't have to learn new configuration.
18. As the maintainer, I want the SQLite connection pool sized to match the Go server's `SetMaxOpenConns(20)`, so that the OCaml server has equivalent concurrent-read characteristics under simulator-style load.
19. As the maintainer, I want a clear list of which behaviors are *not* verified by this experiment, so that I don't conflate "the server runs" with "production-ready."

## Implementation Decisions

### Branch and directory layout

- All work happens on the existing experiment branch. `main` remains untouched.
- `apps/sync/` is renamed to `apps/sync_go/` in a dedicated mechanical commit. This commit updates: the Go module path declared in `go.mod` (currently `module sync`) and all internal import paths derived from it, the workspace package's `name` field, any `turbo.json` references, and any references from `sync-simulator/` at the repo root.
- A new `apps/sync/` directory is created for the OCaml implementation. It is laid out as a conventional OCaml project: `dune-project`, generated `sync.opam`, a `package.json` exposing turbo-compatible scripts, `bin/main.ml` for the entrypoint, a flat `lib/` directory with one module per file, and `_opam/` plus `_build/` in `.gitignore`.

### Toolchain and build

- Per-project local opam switch (`opam switch create . 5.x --deps-only`). The switch lives in `_opam/` inside `apps/sync/` and is gitignored. `sync.opam` is committed and is the reproducibility manifest.
- `dune` drives compilation. `apps/sync/package.json` exposes `build` (`dune build`), `dev` (runs the binary, mirroring `pnpm dev` for the Go app), and (eventually) `test` (`dune test`). Turbo and pnpm interact with these scripts, not with `dune` or `opam` directly.

### Runtime stack

- **Concurrency**: Eio. Direct-style code, no `Lwt.bind` / function coloring. Chosen explicitly over Lwt+Dream because the maintainer's "C-motivated" experiment should expose modern OCaml ergonomics, not legacy ones.
- **HTTP**: Piaf, Eio-native. Routing is a hand-written pattern match on path inside a single top-level handler, mirroring the Go server's `handler.go` style. This is a deliberate match for the current Go server's "stdlib + manual routing" feel; not a framework decision.
- **SQLite**: Caqti with `caqti-driver-sqlite3` and `caqti-eio`. Provides connection pooling out of the box (sized to 20 to match Go), typed `Caqti_request` queries, and a `with_transaction` helper that matches the Go `BeginTx`/`Commit`/`Rollback` pattern.
- **JSON**: yojson with `ppx_yojson_conv` for derived codecs on the simple record types (`Dot`, `SyncRequest`, `SyncResponse`). The `CRDTOperation` type uses a **hand-written codec** (see below) because the sum-type representation does not fit `ppx_yojson_conv`'s adjacent-tag conventions. Opaque JSON values (corresponding to Go's `json.RawMessage` for `value`) are carried as `Yojson.Safe.t`.
- **JWT**: `jose` for parsing, signature validation, and claim extraction. A small `Jwks_cache` module (estimated ~50 lines) inside `Auth` performs the initial JWKS fetch at startup using a Piaf client and spawns a background Eio fiber that refreshes every 5 minutes, matching the Go `jwx/v2/jwk.Cache` behavior.
- **Errors**: Exceptions are the idiom. The top-level Piaf handler catches and maps to HTTP status codes (auth failures → 401, validation failures → 400, Caqti errors → 500). No `Result.t` plumbing through the request path.
- **Logging**: `Logs` library with `Logs_fmt` reporter. Each module declares its own log source (`Sync_engine`, `Repository`, `Auth`, `Server`). Level is controlled at startup from a `LOG_LEVEL` env var.

### `CRDTOperation` modeling (the central refactor)

The Go shape (a flat struct where `Field`, `Value`, and `Context` are meaningful only for certain `Type` values) is replaced with a sum-type payload behind shared metadata. The wire format on the network is identical to Go's; the change is internal only.

The OCaml shape this experiment commits to:

```ocaml
type dot = { client_id : string; version : int64 }

type op_payload =
  | Set     of { field : string; value : Yojson.Safe.t }
  | Set_row of { value : Yojson.Safe.t }
  | Remove  of { context : (string * int64) list }
  (* additional variants as the Go op vocabulary requires *)

type crdt_operation = {
  table   : string;
  row_key : string;
  dot     : dot;
  payload : op_payload;
}
```

JSON decoder dispatches on the `"type"` field and validates that the required payload fields for that variant are present; missing-required and present-but-illegal-for-this-variant are both rejected at the wire boundary. Encoder is the inverse, producing Go-compatible JSON with `omitempty`-equivalent behavior (variants omit fields they don't have). This is the load-bearing piece of the port: many of the runtime invariant checks in `integrity.go` become "the type doesn't admit it" instead.

### Module sketch (flat `lib/`)

- **`Sync_engine`** — Pure domain module. Owns the `crdt_operation` and `op_payload` types, their JSON codec, and all CRDT processing logic (the contents of today's Go `internal/sync_engine/`). Entry point: a single `process_sync_request` function taking a parsed `SyncRequest` and a repository handle, returning a `SyncResponse`. No knowledge of Piaf or HTTP. Designed as a deep module — small surface, all CRDT semantics encapsulated.
- **`Repository`** — Caqti queries against the `crdt_operations` SQLite table. Owns schema initialization and the transaction-with-callback helper. One function per Go repository query, typed via `Caqti_request`. The shape of the public interface tracks the existing Go `repository.go`.
- **`Auth`** — JWT bearer validation. Exposes one entry point, `validate_bearer`, which returns a `user_id` on success and raises a typed exception on failure. Hides the `Jwks_cache` (fetch, in-memory store, background refresh fiber) entirely. Designed as a deep module.
- **`Server`** — Piaf handler and route dispatch. Wires `Auth.validate_bearer` and `Sync_engine.process_sync_request` together. Parses incoming JSON to typed records, serializes responses, maps exceptions to HTTP status codes. Deliberately shallow — this is the wiring layer.
- **`Utils`** — Hashing for `requestHash` / `responseHash`, base64 helpers, miscellaneous. Shallow.
- **`bin/main.ml`** — Reads env vars (`AUTH_ISSUER_URL`, port, DB path), opens the Caqti pool, initializes schema, constructs the `Auth` handle (which kicks off the JWKS refresh fiber), and starts the Piaf server under `Eio_main.run`.

### Wire and storage compatibility

- The HTTP wire format (request and response JSON shape, field names in `camelCase`, presence/absence rules for optional fields, the algorithm for `requestHash` and `responseHash`) is unchanged. The existing Go simulator is the conformance test for this.
- The SQLite schema (`crdt_operations` table, all columns, all indexes) is unchanged. An existing `sync.db` file is usable against the OCaml binary with no migration.
- Env var contract is unchanged.

### Definition of done

All modules listed in the module sketch are ported, `pnpm --filter sync build` produces a working binary, `pnpm --filter sync dev` starts the OCaml server cleanly against a real (or stub) JWKS issuer, and the maintainer's manual sanity checks against the running server confirm equivalent behavior to the Go server for the scenarios they care about. "Equivalent" is a judgment call by the maintainer; there is no automated parity oracle in this experiment.

### Kill criterion

If the maintainer concludes — at any point during the port — that the OCaml stack is not paying off (build/toolchain friction, ecosystem gaps, or the code is not actually clearer than the Go version), the experiment branch is abandoned. The Go server on `main` is unaffected. This is an explicit judgment call, not a metric.

## Testing Decisions

Tests are **deferred for this POC** by explicit decision. There is **no automated oracle** in this experiment — verification is the maintainer's manual sanity check against the running server.

A good test in this codebase tests **external behavior, not implementation details**: for a sync server, that means scenarios that drive requests through the HTTP layer and assert on observable state (response shape, persisted rows). The Go simulator under `apps/sync_go/cmd/simulator/` is the prior art for what such tests look like, though it is not used to verify the OCaml server in this experiment (it is structurally an in-process Go-only harness; retrofitting it for cross-language use was ruled out of scope).

If the experiment succeeds and OCaml is promoted to source-of-truth, the two modules naturally suited to isolated tests — and which should grow test suites before that promotion — are:

- **`Sync_engine`**, with a fake repository handed in. Targets the CRDT integrity rules currently covered by `integrity_test.go` and the JSON round-trip covered by `conversion_fuzz_test.go` (the latter is a strong fit for a QCheck property test).
- **`Auth`**, with a fake JWKS fetcher injected in place of the Piaf client. Targets the behaviors currently covered by `middleware_test.go`.

`alcotest` and `qcheck-alcotest` are the recommended frameworks if and when tests are added. No test scaffolding is created during the POC.

## Out of Scope

- **Simulator-driven verification of the OCaml server.** The Go simulator under `apps/sync_go/cmd/simulator/` is structurally in-process (it calls the Go handler directly via `httptest`, not over HTTP) and was ruled out of scope as a parity oracle for this experiment. The simulator continues to exist and to verify the Go server; it does not exercise the OCaml server in any form.
- **Porting the Go simulator to OCaml.** Same rationale.
- **Unit and property tests for the OCaml implementation.** Deferred per the decisions above. Will be revisited before promoting OCaml to source-of-truth.
- **Changes to the HTTP wire format, CRDT semantics, or SQLite schema.** This is a language migration, not a protocol or data-model change. Any improvement to those is a separate decision and a separate ticket.
- **Production deployment, Docker images, CI integration for the OCaml build.** Local dev only during the experiment. Promotion comes after parity is demonstrated.
- **Migrating other apps in the monorepo to OCaml.** This is a single-app experiment; standardization is not implied.
- **Nix flake or devcontainer for the OCaml toolchain.** Local opam switch only.
- **Performance benchmarking between the two implementations.** "Similar performance" is a stated assumption, not a deliverable to verify in this experiment.
- **Renaming or restructuring the rest of the monorepo.** Only `apps/sync/` is touched.

## Further Notes

- The motivation behind this experiment is honest-to-self: a real modeling itch (`CRDTOperation` wants to be a sum type) plus aesthetic preference for OCaml. It is *not* solving a current production maintenance pain. The decisions above (sibling directory, simulator-as-oracle, hard kill criterion) are calibrated to that honesty — they keep the cost of abandonment small.
- The chosen stack (Eio + Piaf + Caqti) intentionally favors modern, direct-style OCaml over the older Lwt + Dream ecosystem. This is part of what the experiment is testing: whether modern OCaml feels good to write in this codebase. Choosing the safer Lwt path would have made the port faster but would have answered a different (and less interesting) question.
- The sum-type refactor of `CRDTOperation` is the single most important design decision in the port. Translating the Go struct 1:1 with `option` fields would technically work and would port faster, but it would defeat the purpose of the experiment — the port would conclude "OCaml feels like Go with different syntax" because it wouldn't have used OCaml.
- Verification gaps explicitly accepted for the POC: no unit tests, no automated parity oracle, no simulator coverage. "Parity" is whatever the maintainer manually exercises against the running server. This is acceptable for an experiment whose primary question is "do I enjoy writing OCaml in this codebase and is the sum-type modeling a real win?" — a question that can be answered without an oracle. It is **not** acceptable as a basis for promoting OCaml to source-of-truth; tests and an automated parity story must come back before that promotion.
