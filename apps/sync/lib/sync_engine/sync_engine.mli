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
  operations : crdt_operation list;
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

val sync_error_to_string : sync_error -> string

val decode_sync_request : string -> (sync_request, string) result
val encode_sync_response : sync_response -> string
val hash_sync_request : sync_request -> string
val hash_sync_response : sync_response -> string

val process_sync_request_with_connection
  :  Repository.connection
  -> sync_request
  -> (sync_response, sync_error) result
