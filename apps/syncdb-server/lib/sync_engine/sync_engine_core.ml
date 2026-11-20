type dot = { client_id : string; version : int64 }

type op_payload =
  | Set_row of { fields : Yojson.Safe.t }
  | Remove_row of { version_vector : (string * int64) list }
  | Checkpoint_row of { checkpoint_seen_server_version : int64; state : Yojson.Safe.t }

type crdt_operation = {
  table_name : string;
  row_key : string;
  dot : dot;
  payload : op_payload;
}

type mutation = { id : int64; operation : crdt_operation }

type sync_request = {
  protocol_version : int;
  client_id : string;
  db_name : string;
  client_last_mutation_id : int64;
  mutations : mutation list;
  (*TODO: rename last_seen_server_version to pull_cursor*)
  last_seen_server_version : int64;
  request_hash : string;
}

type sync_response = {
  protocol_version : int;
  client_id : string;
  base_server_version : int64;
  latest_server_version : int64;
  last_mutation_id : int64;
  operations : crdt_operation list;
  operation_server_versions : int64 list;
  response_hash : string;
}

type sync_error =
  | Request_integrity_failed
  | Client_state_out_of_sync of { last_seen : int64; max_server : int64 }
  | Client_mutation_state_diverged of { client_last_mutation_id : int64; server_last_mutation_id : int64 }
  | Client_mutation_gap of { expected : int64; received : int64 }
  | Logical_clock_regression of { client_id : string; expected_gt : int64; received : int64 }
  | Storage_error of string
  | Decode_error of string

let sync_error_to_string = function
  | Request_integrity_failed -> "request integrity check failed"
  | Client_state_out_of_sync { last_seen; max_server } ->
      Printf.sprintf "client state out of sync: lastSeen=%Ld max=%Ld" last_seen
        max_server
  | Client_mutation_state_diverged { client_last_mutation_id; server_last_mutation_id } ->
      Printf.sprintf "CLIENT_MUTATION_STATE_DIVERGED: clientLastMutationID=%Ld serverLastMutationID=%Ld"
        client_last_mutation_id server_last_mutation_id
  | Client_mutation_gap { expected; received } ->
      Printf.sprintf "CLIENT_MUTATION_GAP: expected=%Ld received=%Ld" expected received
  | Logical_clock_regression { client_id; expected_gt; received } ->
      Printf.sprintf "LOGICAL_CLOCK_REGRESSION: client=%s expected_gt=%Ld received=%Ld"
        client_id expected_gt received
  | Storage_error msg -> msg
  | Decode_error msg -> msg

let sync_error_code = function
  | Request_integrity_failed -> "REQUEST_INTEGRITY_FAILED"
  | Client_state_out_of_sync _ -> "CLIENT_STATE_OUT_OF_SYNC"
  | Client_mutation_state_diverged _ -> "CLIENT_MUTATION_STATE_DIVERGED"
  | Client_mutation_gap _ -> "CLIENT_MUTATION_GAP"
  | Logical_clock_regression _ -> "LOGICAL_CLOCK_REGRESSION"
  | Storage_error _ -> "DATABASE_ERROR"
  | Decode_error _ -> "INVALID_OPERATION"

let operation_type = function
  | Set_row _ -> "setRow"
  | Remove_row _ -> "removeRow"
  | Checkpoint_row _ -> "checkpointRow"

let int64_of_json = function
  | `Int value -> Int64.of_int value
  | `Intlit value -> Int64.of_string value
  | `String value -> Int64.of_string value
  | json ->
      let open Yojson.Safe in
      raise (Util.Type_error ("expected int64-compatible JSON value", json))

let has_key key = function
  | `Assoc fields -> List.mem_assoc key fields
  | _ -> false

let canonical_version_vector_json version_vector =
  let sorted = List.sort (fun (a, _) (b, _) -> String.compare a b) version_vector in
  `Assoc
    (List.map
       (fun (client_id, version) ->
         (client_id, `Intlit (Int64.to_string version)))
       sorted)
  |> Yojson.Safe.to_string

let dot_key (dot : dot) = Printf.sprintf "%s#%Ld" dot.client_id dot.version
