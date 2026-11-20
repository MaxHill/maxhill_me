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
  | Migration_required
  | Duplicate_insert_conflict_missing_existing_row
  | Crdt_consistency_violation of { client_id : string; version : int64 }

let error_to_string = function
  | Database msg -> msg
  | Migration_required -> "migration required"
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

(* Per-client committed mutation and logical-clock frontiers survive row compaction. *)
let client_state_schema_sql =
  {|CREATE TABLE IF NOT EXISTS client_sync_state (
    tenant_id TEXT NOT NULL,
    db_name TEXT NOT NULL,
    client_id TEXT NOT NULL,
    last_mutation_id INTEGER NOT NULL,
    last_client_version INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, db_name, client_id)
  )|}

let schema_marker_sql =
  {|CREATE TABLE IF NOT EXISTS protocol_schema_marker (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL
  )|}

let db_row_type =
  Caqti_type.(t11 int64 string string string int64 string string string (option string) (option string) (option string))

let db_params_type =
  Caqti_type.(t10 string string string int64 string string string (option string) (option string) (option string))

let indexes_sql =
  {|CREATE INDEX IF NOT EXISTS idx_tenant_db_server_version ON crdt_operations(tenant_id, db_name, server_version);
CREATE INDEX IF NOT EXISTS idx_tenant_db_table_row ON crdt_operations(tenant_id, db_name, table_name, row_key);
CREATE INDEX IF NOT EXISTS idx_type ON crdt_operations(type);
CREATE INDEX IF NOT EXISTS idx_tenant_db_client_version ON crdt_operations(tenant_id, db_name, client_id, version);|}

let table_exists_query =
  let open Caqti_request.Infix in
  (Caqti_type.string ->! Caqti_type.int)
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?"

let user_table_count_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->! Caqti_type.int)
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"

let schema_marker_version_query =
  let open Caqti_request.Infix in
  (Caqti_type.unit ->? Caqti_type.int)
    "SELECT schema_version FROM protocol_schema_marker WHERE id = 1"

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

let get_row_prefix_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t5 string string string string int64) ->* db_row_type)
    "SELECT server_version, tenant_id, db_name, client_id, version, type, table_name, row_key, field_key, json_value, version_vector FROM crdt_operations WHERE tenant_id = ? AND db_name = ? AND table_name = ? AND row_key = ? AND server_version < ? ORDER BY server_version ASC"

let delete_row_prefix_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t5 string string string string int64) ->. Caqti_type.unit)
    "DELETE FROM crdt_operations WHERE tenant_id = ? AND db_name = ? AND table_name = ? AND row_key = ? AND server_version < ?"

let find_by_dot_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t4 string string string int64) ->? db_row_type)
    "SELECT server_version, tenant_id, db_name, client_id, version, type, table_name, row_key, field_key, json_value, version_vector FROM crdt_operations WHERE tenant_id = ? AND db_name = ? AND client_id = ? AND version = ?"

let get_max_server_version_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t2 string string) ->! Caqti_type.int64)
    "SELECT COALESCE(MAX(server_version), -1) FROM crdt_operations WHERE tenant_id = ? AND db_name = ?"

type client_state = {
  last_mutation_id : int64;
  last_client_version : int64;
}

let get_client_state_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t3 string string string) ->? Caqti_type.(t2 int64 int64))
    "SELECT last_mutation_id, last_client_version FROM client_sync_state WHERE tenant_id = ? AND db_name = ? AND client_id = ?"

let insert_client_state_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t3 string string string) ->. Caqti_type.unit)
    "INSERT OR IGNORE INTO client_sync_state (tenant_id, db_name, client_id, last_mutation_id, last_client_version) VALUES (?, ?, ?, 0, -1)"

let update_client_state_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t5 int64 int64 string string string) ->. Caqti_type.unit)
    "UPDATE client_sync_state SET last_mutation_id = ?, last_client_version = ? WHERE tenant_id = ? AND db_name = ? AND client_id = ?"


let init_schema (module Db : Caqti_eio.CONNECTION) =
  let conn = (module Db : Caqti_eio.CONNECTION) in
  let table_exists name =
    Db.find table_exists_query name
    |> Result.map_error (fun err -> Database (Caqti_error.show err))
    |> Result.map (fun n -> n > 0)
  in
  let expected_schema_version = 1 in
  let* marker_exists = table_exists "protocol_schema_marker" in
  if marker_exists then (
    let* marker_version =
      Db.find_opt schema_marker_version_query ()
      |> Result.map_error (fun err -> Database (Caqti_error.show err))
    in
    let* () =
      match marker_version with
      | Some version when version = expected_schema_version -> Ok ()
      | _ -> Error Migration_required
    in
    let* crdt_exists = table_exists "crdt_operations" in
    let* client_state_exists = table_exists "client_sync_state" in
    if crdt_exists && client_state_exists then (
      let* () = exec_sql conn schema_sql |> Result.map_error (fun e -> Database (Caqti_error.show e)) in
      exec_sql conn indexes_sql |> Result.map_error (fun e -> Database (Caqti_error.show e)))
    else
      Error Migration_required)
  else
    let* user_tables =
      Db.find user_table_count_query () |> Result.map_error (fun err -> Database (Caqti_error.show err))
    in
    if user_tables > 0 then Error Migration_required
    else
      Db.with_transaction (fun () ->
          let* () = exec_sql conn schema_sql in
          let* () = exec_sql conn indexes_sql in
          let* () = exec_sql conn client_state_schema_sql in
          let* () = exec_sql conn schema_marker_sql in
          let open Caqti_request.Infix in
          let marker_insert = (Caqti_type.unit ->. Caqti_type.unit)
              "INSERT OR REPLACE INTO protocol_schema_marker (id, schema_version) VALUES (1, 1)" in
          Db.exec marker_insert ())
      |> Result.map_error (fun err -> Database (Caqti_error.show err))

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

let get_row_prefix (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name ~table_name ~row_key ~before_server_version =
  match Db.collect_list get_row_prefix_query (tenant_id, db_name, table_name, row_key, before_server_version) with
  | Ok rows -> Ok (List.map of_row rows)
  | Error err -> Error (Database (Caqti_error.show err))

let delete_row_prefix (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name ~table_name ~row_key ~before_server_version =
  match Db.exec delete_row_prefix_query (tenant_id, db_name, table_name, row_key, before_server_version) with
  | Ok () -> Ok ()
  | Error err -> Error (Database (Caqti_error.show err))

let get_max_server_version (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name =
  match Db.find get_max_server_version_query (tenant_id, db_name) with
  | Ok version -> Ok version
  | Error err -> Error (Database (Caqti_error.show err))

let get_or_create_client_state (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name ~client_id =
  let* () =
    Db.exec insert_client_state_query (tenant_id, db_name, client_id)
    |> Result.map_error (fun err -> Database (Caqti_error.show err))
  in
  match Db.find_opt get_client_state_query (tenant_id, db_name, client_id) with
  | Ok (Some (last_mutation_id, last_client_version)) ->
      Ok { last_mutation_id; last_client_version }
  | Ok None -> Error (Database "client state row missing after insert")
  | Error err -> Error (Database (Caqti_error.show err))

let update_client_state (module Db : Caqti_eio.CONNECTION) ~tenant_id ~db_name ~client_id
    ~last_mutation_id ~last_client_version =
  Db.exec update_client_state_query
    (last_mutation_id, last_client_version, tenant_id, db_name, client_id)
  |> Result.map_error (fun err -> Database (Caqti_error.show err))

let with_transaction (module Db : Caqti_eio.CONNECTION) ~map_tx_error f =
  let conn = (module Db : Caqti_eio.CONNECTION) in
  let business_error = ref None in
  try
    match
      Db.with_transaction (fun () ->
          match f conn with
          | Ok value -> Ok value
          | Error err ->
              business_error := Some err;
              raise Exit)
    with
    | Error err -> (
        match !business_error with
        | Some business_err -> Error business_err
        | None -> Error (map_tx_error (Database (Caqti_error.show err))))
    | Ok value -> Ok value
  with
  | Exit -> (
      match !business_error with
      | Some err -> Error err
      | None -> Error (map_tx_error (Database "transaction aborted")))
  | exn ->
      Error
        (map_tx_error
           (Database
              ("transaction callback raised: " ^ Printexc.to_string exn)))

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
