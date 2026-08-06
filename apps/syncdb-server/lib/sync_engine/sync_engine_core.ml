type dot = { client_id : string; version : int64 }

type op_payload =
  | Set of { field : string; value : Yojson.Safe.t }
  | Set_row of { value : Yojson.Safe.t }
  | Remove of { context : (string * int64) list }

type crdt_operation = {
  table : string;
  row_key : string;
  dot : dot;
  payload : op_payload;
}

type sync_request = {
  client_id : string;
  db_name : string;
  operations : crdt_operation list;
  (*TODO: rename last_seen_server_version to pull_cursor*)
  last_seen_server_version : int64;
  request_hash : string;
}

type sync_response = {
  base_server_version : int64;
  latest_server_version : int64;
  operations : crdt_operation list;
  synced_operations : dot list;
  response_hash : string;
}

type sync_error =
  | Request_integrity_failed
  | Client_state_out_of_sync of { last_seen : int64; max_server : int64 }
  | Non_contiguous_versions of string
  | Remove_context_unseen_dot of { client_id : string; version : int64 }
  | Storage_error of string
  | Decode_error of string

let sync_error_to_string = function
  | Request_integrity_failed -> "request integrity check failed"
  | Client_state_out_of_sync { last_seen; max_server } ->
      Printf.sprintf "client state out of sync: lastSeen=%Ld max=%Ld" last_seen
        max_server
  | Non_contiguous_versions client_id ->
      Printf.sprintf "request versions not contiguous for client %s" client_id
  | Remove_context_unseen_dot { client_id; version } ->
      Printf.sprintf "remove context references unseen dot %s#%Ld" client_id
        version
  | Storage_error msg -> msg
  | Decode_error msg -> msg

let operation_type = function
  | Set _ -> "set"
  | Set_row _ -> "setRow"
  | Remove _ -> "remove"

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

let canonical_context_json context =
  let sorted = List.sort (fun (a, _) (b, _) -> String.compare a b) context in
  `Assoc
    (List.map
       (fun (client_id, version) ->
         (client_id, `Intlit (Int64.to_string version)))
       sorted)
  |> Yojson.Safe.to_string

let dot_key (dot : dot) = Printf.sprintf "%s#%Ld" dot.client_id dot.version

let incoming_dot_set operations = operations |> List.map (fun op -> dot_key op.dot)
