type connection = (module Caqti_eio.CONNECTION)
type pool = (connection, Caqti_error.t) Caqti_eio.Pool.t

let ( let* ) = Result.bind

type db_crdt_operation = {
  server_version : int64;
  tenant_id : string;
  db_name : string;
  client_id : string;
  version : int64;
  op_type : string;
  table_name : string;
  row_key : string;
  field_key : string option;
  json_value : string option;
  version_vector : string option;
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

    tenant_id TEXT NOT NULL,
    db_name TEXT NOT NULL,

    -- Dot: composite key (client_id, version) uniquely identifies each operation per tenant
    client_id TEXT NOT NULL,
    version INTEGER NOT NULL,

    -- CRDTOperation fields
    type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    row_key TEXT NOT NULL,
    field_key TEXT,
    json_value TEXT,  -- JSON stored as TEXT in SQLite
    version_vector TEXT,  -- JSON stored as TEXT in SQLite

    -- Ensure each Dot is unique per tenant
    UNIQUE(tenant_id, db_name, client_id, version)
);
|}

let db_row_type =
  Caqti_type.(t11 int64 string string string int64 string string string (option string) (option string) (option string))

let db_params_type =
  Caqti_type.(t10 string string string int64 string string string (option string) (option string) (option string))

let indexes_sql =
  {|CREATE INDEX IF NOT EXISTS idx_tenant_db_server_version ON crdt_operations(tenant_id, db_name, server_version);
CREATE INDEX IF NOT EXISTS idx_tenant_db_table_row ON crdt_operations(tenant_id, db_name, table_name, row_key);
CREATE INDEX IF NOT EXISTS idx_type ON crdt_operations(type);
CREATE INDEX IF NOT EXISTS idx_tenant_db_client_version ON crdt_operations(tenant_id, db_name, client_id, version);|}

let tenant_column_exists_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->! Caqti_type.int)
    "SELECT COUNT(*) FROM pragma_table_info('crdt_operations') WHERE name = 'tenant_id'"

let malformed_legacy_partition_count_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->! Caqti_type.int)
    "SELECT COUNT(*) FROM crdt_operations WHERE instr(db_name, ':') = 0"

let exec_sql (module Db : Caqti_eio.CONNECTION) sql =
  let open Caqti_request.Infix in
  Db.exec ((Caqti_type.unit ->. Caqti_type.unit) sql) ()

let of_row
    ( server_version,
      tenant_id,
      db_name,
      client_id,
      version,
      op_type,
      table_name,
      row_key,
      field_key,
      json_value,
      version_vector ) =
  {
    server_version;
    tenant_id;
    db_name;
    client_id;
    version;
    op_type;
    table_name;
    row_key;
    field_key;
    json_value;
    version_vector;
  }

let init_schema_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->. Caqti_type.unit) schema_sql

let count_operations_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t2 string string) ->! Caqti_type.int)
    "SELECT COUNT(*) FROM crdt_operations WHERE tenant_id = ? AND db_name = ?"

let insert_operation_query =
  let open Caqti_request.Infix in
  (db_params_type ->! Caqti_type.int64)
    "INSERT INTO crdt_operations (tenant_id, db_name, client_id, version, type, table_name, row_key, field_key, json_value, version_vector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING server_version"

let get_operations_since_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t5 string string int64 string int) ->* db_row_type)
    "SELECT server_version, tenant_id, db_name, client_id, version, type, table_name, row_key, field_key, json_value, version_vector FROM crdt_operations WHERE tenant_id = ? AND db_name = ? AND server_version > ? AND client_id != ? ORDER BY server_version ASC LIMIT ?"

let find_by_dot_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t4 string string string int64) ->? db_row_type)
    "SELECT server_version, tenant_id, db_name, client_id, version, type, table_name, row_key, field_key, json_value, version_vector FROM crdt_operations WHERE tenant_id = ? AND db_name = ? AND client_id = ? AND version = ?"

let get_max_server_version_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t2 string string) ->! Caqti_type.int64)
    "SELECT COALESCE(MAX(server_version), -1) FROM crdt_operations WHERE tenant_id = ? AND db_name = ?"

let rename_field_column_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->. Caqti_type.unit)
    "ALTER TABLE crdt_operations RENAME COLUMN field TO field_key"

let rename_value_column_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->. Caqti_type.unit)
    "ALTER TABLE crdt_operations RENAME COLUMN value TO json_value"

let rename_context_column_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->. Caqti_type.unit)
    "ALTER TABLE crdt_operations RENAME COLUMN context TO version_vector"

let migrate_remove_type_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->. Caqti_type.unit)
    "UPDATE crdt_operations SET type = 'removeRow' WHERE type = 'remove'"

let get_set_operations_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->* db_row_type)
    "SELECT server_version, tenant_id, db_name, client_id, version, type, table_name, row_key, field_key, json_value, version_vector FROM crdt_operations WHERE type = 'set'"

let update_set_operation_to_set_row_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t2 string int64) ->. Caqti_type.unit)
    "UPDATE crdt_operations SET type = 'setRow', field_key = NULL, json_value = ? WHERE server_version = ?"

let exec_ignore_error (module Db : Caqti_eio.CONNECTION) query =
  match Db.exec query () with Ok () -> () | Error _ -> ()

let migrate_set_operations (module Db : Caqti_eio.CONNECTION) =
  let migrate_operation operation =
    match (operation.field_key, operation.json_value) with
    | Some field_key, Some json_value ->
        let fields_json =
          `Assoc [ (field_key, Yojson.Safe.from_string json_value) ]
          |> Yojson.Safe.to_string
        in
        Db.exec update_set_operation_to_set_row_query
          (fields_json, operation.server_version)
    | _ -> Ok ()
  in
  match Db.collect_list get_set_operations_query () with
  | Error err -> Error (Database (Caqti_error.show err))
  | Ok rows ->
      let rec loop = function
        | [] -> Ok ()
        | row :: rest -> (
            let operation = of_row row in
            match migrate_operation operation with
            | Ok () -> loop rest
            | Error err -> Error (Database (Caqti_error.show err)))
      in
      loop rows

let migrate_tenant_partition_schema (module Db : Caqti_eio.CONNECTION) =
  match Db.find tenant_column_exists_query () with
  | Error err -> Error (Database (Caqti_error.show err))
  | Ok 1 -> Ok ()
  | Ok _ ->
      let* malformed_count =
        Db.find malformed_legacy_partition_count_query ()
        |> Result.map_error (fun err -> Database (Caqti_error.show err))
      in
      if malformed_count > 0 then
        Error (Database "legacy partition key is missing the dbName:userId separator")
      else
      let migrate () =
        let statements =
          [
            "ALTER TABLE crdt_operations RENAME TO crdt_operations_legacy";
            {|CREATE TABLE crdt_operations (
              server_version INTEGER PRIMARY KEY AUTOINCREMENT,
              tenant_id TEXT NOT NULL,
              db_name TEXT NOT NULL,
              client_id TEXT NOT NULL,
              version INTEGER NOT NULL,
              type TEXT NOT NULL,
              table_name TEXT NOT NULL,
              row_key TEXT NOT NULL,
              field_key TEXT,
              json_value TEXT,
              version_vector TEXT,
              UNIQUE(tenant_id, db_name, client_id, version)
            )|};
            {|INSERT INTO crdt_operations
              (server_version, tenant_id, db_name, client_id, version, type, table_name, row_key, field_key, json_value, version_vector)
              SELECT server_version,
                     substr(db_name, instr(db_name, ':') + 1),
                     substr(db_name, 1, instr(db_name, ':') - 1),
                     client_id, version, type, table_name, row_key, field_key, json_value, version_vector
              FROM crdt_operations_legacy
              WHERE instr(db_name, ':') > 0|};
            "DROP TABLE crdt_operations_legacy";
            indexes_sql;
          ]
        in
        let rec run = function
          | [] -> Ok ()
          | sql :: rest -> (
              match exec_sql (module Db : Caqti_eio.CONNECTION) sql with
              | Error _ as err -> err
              | Ok () -> run rest)
        in
        run statements
      in
      Db.with_transaction (fun () ->
          match migrate () with
          | Ok () -> Ok (Ok ())
          | Error err -> Ok (Error err))
      |> function
      | Error err -> Error (Database (Caqti_error.show err))
      | Ok (Error err) -> Error (Database (Caqti_error.show err))
      | Ok (Ok ()) -> Ok ()

let migrate_schema (module Db : Caqti_eio.CONNECTION) =
  let conn = (module Db : Caqti_eio.CONNECTION) in
  exec_ignore_error conn rename_field_column_query;
  exec_ignore_error conn rename_value_column_query;
  exec_ignore_error conn rename_context_column_query;
  match Db.exec migrate_remove_type_query () with
  | Error err -> Error (Database (Caqti_error.show err))
  | Ok () -> (
      match migrate_tenant_partition_schema (module Db : Caqti_eio.CONNECTION) with
      | Error _ as err -> err
      | Ok () -> migrate_set_operations (module Db : Caqti_eio.CONNECTION))

let init_schema (module Db : Caqti_eio.CONNECTION) =
  match Db.exec init_schema_query () with
  | Error err -> Error (Database (Caqti_error.show err))
  | Ok () -> (
      match migrate_schema (module Db : Caqti_eio.CONNECTION) with
      | Error _ as err -> err
      | Ok () ->
          exec_sql (module Db : Caqti_eio.CONNECTION) indexes_sql
          |> Result.map_error (fun err -> Database (Caqti_error.show err)))

let count_operations (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name =
  match Db.find count_operations_query (tenant_id, db_name) with
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
  a.tenant_id = b.tenant_id
  && a.db_name = b.db_name
  && a.client_id = b.client_id
  && a.version = b.version
  && a.op_type = b.op_type
  && a.table_name = b.table_name
  && a.row_key = b.row_key
  && a.field_key = b.field_key
  && a.json_value = b.json_value
  && a.version_vector = b.version_vector

let insert_crdt_operation (module Db : Caqti_eio.CONNECTION) operation =
  match
    Db.find insert_operation_query
      ( operation.tenant_id,
        operation.db_name,
        operation.client_id,
        operation.version,
        operation.op_type,
        operation.table_name,
        operation.row_key,
        operation.field_key,
        operation.json_value,
        operation.version_vector )
  with
  | Ok server_version -> Ok server_version
  | Error err ->
      if is_unique_constraint_error err then
        (match
           Db.find_opt find_by_dot_query
             (operation.tenant_id, operation.db_name, operation.client_id, operation.version)
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

let get_operations_since (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name ~server_version ~limit ~exclude_client_id =
  match
    Db.collect_list get_operations_since_query
      (tenant_id, db_name, server_version, exclude_client_id, limit)
  with
  | Ok rows -> Ok (List.map of_row rows)
  | Error err -> Error (Database (Caqti_error.show err))

let get_max_server_version (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name =
  match Db.find get_max_server_version_query (tenant_id, db_name) with
  | Ok version -> Ok version
  | Error err -> Error (Database (Caqti_error.show err))

let has_operation_dot (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name ~client_id ~version =
  match Db.find_opt find_by_dot_query (tenant_id, db_name, client_id, version) with
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

let count_operations_with_pool pool ~tenant_id ~db_name =
  match
    Caqti_eio.Pool.use (fun conn -> Ok (count_operations conn ~tenant_id ~db_name)) pool
  with
  | Ok result -> result
  | Error err -> Error (Database (Caqti_error.show err))
