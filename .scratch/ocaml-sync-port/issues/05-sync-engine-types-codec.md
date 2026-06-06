---
Status: done
---

# Sync_engine types + sum-type JSON codec + `POST /sync` echo

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Introduce `lib/sync_engine.ml` containing the domain types for the CRDT protocol: `dot`, `op_payload` (sum type, one variant per CRDT op kind in the Go server), `crdt_operation`, `sync_request`, `sync_response`. Implement a hand-written yojson codec for `crdt_operation` that dispatches on the `"type"` discriminator, validates payload-field presence per variant, and rejects malformed combinations at the wire boundary. The other record types use `[@@deriving yojson]` from `ppx_yojson_conv`, with `[@key "camelCase"]` attributes to preserve the exact Go JSON field names.

Add a `POST /sync` endpoint that decodes a `SyncRequest`, computes the correct `requestHash`/`responseHash` per the Go server's algorithm (move the hash logic into a small `Utils` module if helpful), and returns a `SyncResponse` with empty `operations` and `syncedOperations` lists. No engine logic yet — this slice proves the wire format round-trips byte-compatibly with Go.

The sum-type shape this slice commits to (from the PRD, validated during grilling):

```ocaml
type dot = { client_id : string; version : int64 }

type op_payload =
  | Set     of { field : string; value : Yojson.Safe.t }
  | Set_row of { value : Yojson.Safe.t }
  | Remove  of { context : (string * int64) list }
  (* plus any additional variants present in the Go op vocabulary *)

type crdt_operation = {
  table   : string;
  row_key : string;
  dot     : dot;
  payload : op_payload;
}
```

`Yojson.Safe.t` is used for the opaque `value` field (matching Go's `json.RawMessage` pass-through). Field-omission semantics for variants must match Go's `omitempty` behavior: variants omit fields they don't have, rather than emitting `null`.

## Acceptance criteria

- [ ] `lib/sync_engine.ml` exposes the types above (or the full variant set if Go's op vocabulary is larger than three)
- [ ] A hand-written yojson decoder for `crdt_operation` correctly parses every op kind the Go server accepts
- [ ] The decoder rejects requests where the discriminator does not match the payload fields (e.g. `"type": "set"` without `"field"`)
- [ ] The encoder produces JSON byte-equal to what the Go server produces for the same logical operation
- [ ] `POST /sync` accepts a valid `SyncRequest`, returns a well-formed empty `SyncResponse` with correct `responseHash`
- [ ] A request crafted to match a real Go-server request produces a response whose hash matches what the Go server would produce for the same empty-response case
- [ ] Malformed JSON returns HTTP 400 with a logged decode error
- [ ] `pnpm --filter sync build` succeeds

## Blocked by

`.scratch/ocaml-sync-port/issues/03-piaf-server-health-endpoint.md`
