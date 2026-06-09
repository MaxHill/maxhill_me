type connection = (module Caqti_eio.CONNECTION)
type pool = (connection, Caqti_error.t) Caqti_eio.Pool.t

type db_crdt_operation = {
  server_version : int64;
  client_id : string;
  version : int64;
  op_type : string;
  table_name : string;
  row_key : string;
  field : string option;
  value : string option;
  context : string option;
}

type error =
  | Database of string
  | Duplicate_insert_conflict_missing_existing_row
  | Crdt_consistency_violation of { client_id : string; version : int64 }

val error_to_string : error -> string

val init_schema : connection -> (unit, error) result
val count_operations : connection -> (int, error) result
val insert_crdt_operation : connection -> db_crdt_operation -> (int64, error) result

val insert_crdt_operations
  :  connection
  -> db_crdt_operation list
  -> (int64 list, error) result

val get_operations_since
  :  connection
  -> server_version:int64
  -> limit:int
  -> exclude_client_id:string
  -> (db_crdt_operation list, error) result

val get_max_server_version : connection -> (int64, error) result
val has_operation_dot : connection -> client_id:string -> version:int64 -> (bool, error) result

val with_transaction
  :  connection
  -> map_tx_error:(error -> 'e)
  -> (connection -> ('a, 'e) result)
  -> ('a, 'e) result

val init_schema_with_pool : pool -> (unit, error) result
val count_operations_with_pool : pool -> (int, error) result
