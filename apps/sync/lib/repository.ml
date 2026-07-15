type connection = (module Caqti_eio.CONNECTION)
type pool = (connection, Caqti_error.t) Caqti_eio.Pool.t

type db_crdt_operation = {
  server_version : int64;
  db_name : string;
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

let error_to_string = function
  | Database msg -> msg
  | Duplicate_insert_conflict_missing_existing_row ->
      "duplicate insert conflict with missing existing row"
  | Crdt_consistency_violation { client_id; version } ->
      Printf.sprintf "CRDT consistency violation for (%s, %Ld)" client_id version

let schema_sql =
  {|CREATE TABLE IF NOT EXISTS crdt_operations (
    -- server_version is the primary key for global ordering of all operations
    server_version INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Tenant partition key: db_name:user_id
    db_name TEXT NOT NULL,

    -- Dot: composite key (client_id, version) uniquely identifies each operation per tenant
    client_id TEXT NOT NULL,
    version INTEGER NOT NULL,

    -- CRDTOperation fields
    type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    row_key TEXT NOT NULL,
    field TEXT,
    value TEXT,  -- JSON stored as TEXT in SQLite
    context TEXT,  -- JSON stored as TEXT in SQLite

    -- Ensure each Dot is unique per tenant
    UNIQUE(db_name, client_id, version)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_db_name_server_version ON crdt_operations(db_name, server_version);
CREATE INDEX IF NOT EXISTS idx_db_name_table_row ON crdt_operations(db_name, table_name, row_key);
CREATE INDEX IF NOT EXISTS idx_type ON crdt_operations(type);
CREATE INDEX IF NOT EXISTS idx_db_name_client_version ON crdt_operations(db_name, client_id, version);
|}

let db_row_type =
  Caqti_type.(t10 int64 string string int64 string string string (option string) (option string) (option string))

let db_params_type =
  Caqti_type.(t9 string string int64 string string string (option string) (option string) (option string))

let of_row
    ( server_version,
      db_name,
      client_id,
      version,
      op_type,
      table_name,
      row_key,
      field,
      value,
      context ) =
  {
    server_version;
    db_name;
    client_id;
    version;
    op_type;
    table_name;
    row_key;
    field;
    value;
    context;
  }

let init_schema_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->. Caqti_type.unit) schema_sql

let count_operations_query =
  let open Caqti_request.Infix in
  (Caqti_type.string ->! Caqti_type.int)
    "SELECT COUNT(*) FROM crdt_operations WHERE db_name = ?"

let insert_operation_query =
  let open Caqti_request.Infix in
  (db_params_type ->! Caqti_type.int64)
    "INSERT INTO crdt_operations (db_name, client_id, version, type, table_name, row_key, field, value, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING server_version"

let get_operations_since_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t4 string int64 string int) ->* db_row_type)
    "SELECT server_version, db_name, client_id, version, type, table_name, row_key, field, value, context FROM crdt_operations WHERE db_name = ? AND server_version > ? AND client_id != ? ORDER BY server_version ASC LIMIT ?"

let find_by_dot_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t3 string string int64) ->? db_row_type)
    "SELECT server_version, db_name, client_id, version, type, table_name, row_key, field, value, context FROM crdt_operations WHERE db_name = ? AND client_id = ? AND version = ?"

let get_max_server_version_query =
  let open Caqti_request.Infix in
  (Caqti_type.string ->! Caqti_type.int64)
    "SELECT COALESCE(MAX(server_version), -1) FROM crdt_operations WHERE db_name = ?"

let init_schema (module Db : Caqti_eio.CONNECTION) =
  match Db.exec init_schema_query () with
  | Ok () -> Ok ()
  | Error err -> Error (Database (Caqti_error.show err))

let count_operations (module Db : Caqti_eio.CONNECTION) ~db_name =
  match Db.find count_operations_query db_name with
  | Ok count -> Ok count
  | Error err -> Error (Database (Caqti_error.show err))

let string_contains_substring haystack needle =
  let haystack_len = String.length haystack in
  let needle_len = String.length needle in
  let rec loop i =
    if i + needle_len > haystack_len then false
    else if String.sub haystack i needle_len = needle then true
    else loop (i + 1)
  in
  if needle_len = 0 then true else loop 0

let is_unique_constraint_error err =
  Caqti_error.show err |> fun msg -> string_contains_substring msg "UNIQUE constraint"

let equivalent_operation a b =
  a.db_name = b.db_name
  && a.client_id = b.client_id
  && a.version = b.version
  && a.op_type = b.op_type
  && a.table_name = b.table_name
  && a.row_key = b.row_key
  && a.field = b.field
  && a.value = b.value
  && a.context = b.context

let insert_crdt_operation (module Db : Caqti_eio.CONNECTION) operation =
  match
    Db.find insert_operation_query
      ( operation.db_name,
        operation.client_id,
        operation.version,
        operation.op_type,
        operation.table_name,
        operation.row_key,
        operation.field,
        operation.value,
        operation.context )
  with
  | Ok server_version -> Ok server_version
  | Error err ->
      if is_unique_constraint_error err then
        (match
           Db.find_opt find_by_dot_query
             (operation.db_name, operation.client_id, operation.version)
         with
        | Error select_err -> Error (Database (Caqti_error.show select_err))
        | Ok None -> Error Duplicate_insert_conflict_missing_existing_row
        | Ok (Some row) ->
            let existing = of_row row in
            if equivalent_operation operation existing then Ok existing.server_version
            else
              Error
                (Crdt_consistency_violation
                   {
                     client_id = operation.client_id;
                     version = operation.version;
                   }))
      else Error (Database (Caqti_error.show err))

let insert_crdt_operations connection operations =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | operation :: rest -> (
        match insert_crdt_operation connection operation with
        | Error _ as err -> err
        | Ok server_version -> loop (server_version :: acc) rest)
  in
  loop [] operations

let get_operations_since (module Db : Caqti_eio.CONNECTION) ~db_name ~server_version ~limit ~exclude_client_id =
  match
    Db.collect_list get_operations_since_query
      (db_name, server_version, exclude_client_id, limit)
  with
  | Ok rows -> Ok (List.map of_row rows)
  | Error err -> Error (Database (Caqti_error.show err))

let get_max_server_version (module Db : Caqti_eio.CONNECTION) ~db_name =
  match Db.find get_max_server_version_query db_name with
  | Ok version -> Ok version
  | Error err -> Error (Database (Caqti_error.show err))

let has_operation_dot (module Db : Caqti_eio.CONNECTION) ~db_name ~client_id ~version =
  match Db.find_opt find_by_dot_query (db_name, client_id, version) with
  | Ok (Some _) -> Ok true
  | Ok None -> Ok false
  | Error err -> Error (Database (Caqti_error.show err))

let with_transaction (module Db : Caqti_eio.CONNECTION) ~map_tx_error f =
  let conn = (module Db : Caqti_eio.CONNECTION) in
  Db.with_transaction (fun () ->
      try
        match f conn with
        | Ok value -> Ok (Ok value)
        | Error err -> Ok (Error err)
      with
      | exn ->
          Ok
            (Error
               (map_tx_error
                  (Database
                     ("transaction callback raised: "
                    ^ Printexc.to_string exn)))))
  |> function
  | Error err -> Error (map_tx_error (Database (Caqti_error.show err)))
  | Ok (Error err) -> Error err
  | Ok (Ok value) -> Ok value

let init_schema_with_pool pool =
  match Caqti_eio.Pool.use (fun conn -> Ok (init_schema conn)) pool with
  | Ok result -> result
  | Error err -> Error (Database (Caqti_error.show err))

let count_operations_with_pool pool ~db_name =
  match
    Caqti_eio.Pool.use (fun conn -> Ok (count_operations conn ~db_name)) pool
  with
  | Ok result -> result
  | Error err -> Error (Database (Caqti_error.show err))
