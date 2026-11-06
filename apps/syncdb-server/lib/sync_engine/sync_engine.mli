include module type of Sync_engine_core

val decode_sync_request : string -> (sync_request, string) result
val encode_sync_response : sync_response -> string
val hash_sync_request : sync_request -> string
val hash_sync_response : sync_response -> string

val compact_row_with_connection
  :  Repository.connection
  -> tenant_id:string
  -> db_name:string
  -> table_name:string
  -> row_key:string
  -> checkpoint_seen_server_version:int64
  -> (crdt_operation, sync_error) result

val process_sync_request_with_connection
  :  ?checkpoint_threshold_operations:int
  -> ?checkpoint_threshold_bytes:int
  -> Repository.connection
  -> tenant_id:string
  -> db_name:string
  -> sync_request
  -> (sync_response, sync_error) result
