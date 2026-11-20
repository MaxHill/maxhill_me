let with_connection f =
  Eio_main.run @@ fun env ->
  Eio.Switch.run @@ fun sw ->
  let db_path = Filename.concat (Filename.get_temp_dir_name ()) "sync-ocaml-test.db" in
  (try Unix.unlink db_path with _ -> ());
  let uri = Uri.make ~scheme:"sqlite3" ~path:db_path () in
  match Caqti_eio_unix.connect ~sw ~stdenv:(env :> Caqti_eio.stdenv) uri with
  | Error err -> failwith (Caqti_error.show err)
  | Ok conn ->
      let result = f conn in
      (try Unix.unlink db_path with _ -> ());
      result

let tenant = "user-1"
let db_name = "main"

let make_op version : Sync.Repository.db_crdt_operation =
  { server_version = 0L;
    tenant_id = tenant;
    db_name;
    client_id = "client-1";
    version;
    op_type = "setRow";
    table_name = "todos";
    row_key = "r1";
    field_key = None;
    json_value = Some "{\"title\":\"Buy milk\"}";
    version_vector = None }

let exec_sql conn sql =
  let module Db = (val conn : Caqti_eio.CONNECTION) in
  let open Caqti_request.Infix in
  match Db.exec ((Caqti_type.unit ->. Caqti_type.unit) sql) () with
  | Ok () -> ()
  | Error err -> failwith (Caqti_error.show err)

let assert_init_schema_and_client_state () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let state =
    match Sync.Repository.get_or_create_client_state conn ~tenant_id:tenant ~db_name ~client_id:"client-1" with
    | Ok s -> s
    | Error err -> failwith (Sync.Repository.error_to_string err)
  in
  assert (state.last_mutation_id = 0L);
  assert (state.last_client_version = -1L)

let assert_migration_required_on_existing_unknown_schema () =
  with_connection @@ fun conn ->
  exec_sql conn "CREATE TABLE legacy_table (id INTEGER PRIMARY KEY)";
  match Sync.Repository.init_schema conn with
  | Error Sync.Repository.Migration_required -> ()
  | Ok () -> failwith "expected migration_required"
  | Error err -> failwith (Sync.Repository.error_to_string err)

let assert_insert_and_fetch () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  ignore (Sync.Repository.insert_crdt_operation conn (make_op 1L));
  match
    Sync.Repository.get_operations_since conn ~tenant_id:tenant ~db_name
      ~server_version:0L ~limit:10 ~exclude_client_id:"other"
  with
  | Ok [ row ] -> assert (row.version = 1L)
  | Ok _ -> failwith "expected one row"
  | Error err -> failwith (Sync.Repository.error_to_string err)

let () =
  assert_init_schema_and_client_state ();
  assert_migration_required_on_existing_unknown_schema ();
  assert_insert_and_fetch ()
