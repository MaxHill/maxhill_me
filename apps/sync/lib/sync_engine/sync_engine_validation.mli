open Sync_engine_core

(** Fail fast on tampered or corrupted payloads before touching storage. *)
val ensure_request_hash_valid : sync_request -> (unit, sync_error) result

(** Prevent clients from syncing against a server state that cannot exist yet. *)
val ensure_client_not_ahead
  :  last_seen:int64
  -> max_server:int64
  -> (unit, sync_error) result

(** Preserve per-client causality so merge semantics stay deterministic. *)
val ensure_versions_contiguous : crdt_operation list -> (unit, sync_error) result

(** Reject tombstones that reference dots we cannot prove are known. *)
val ensure_remove_context_known
  :  Repository.connection
  -> crdt_operation list
  -> (unit, sync_error) result
