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

let tenant_a = "user-1"
let tenant_b = "user-2"
let db_name = "todos"

let make_op ?(tenant_id = tenant_a) ?(db_name = db_name)
    ?(value = "{\"title\":\"Buy milk\"}") ()
    : Sync.Repository.db_crdt_operation =
  {
    server_version = 0L;
    tenant_id;
    db_name;
    client_id = "client-1";
    version = 1L;
    op_type = "setRow";
    table_name = "todos";
    row_key = "r1";
    field_key = None;
    json_value = Some value;
    version_vector = None;
  }

let make_legacy_set_op () : Sync.Repository.db_crdt_operation =
  {
    (make_op ()) with
    op_type = "set";
    field_key = Some "title";
    json_value = Some "\"Buy milk\"";
  }

let assert_init_schema_and_count_empty () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> (
      match Sync.Repository.count_operations conn ~tenant_id:tenant_a ~db_name with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok count -> assert (count = 0))

let assert_insert_and_fetch_operations_since () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () ->
      let op = make_op () in
      (match Sync.Repository.insert_crdt_operation conn op with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok server_version -> assert (server_version = 1L));
      match
        Sync.Repository.get_operations_since conn ~tenant_id:tenant_a ~db_name
          ~server_version:0L ~limit:100 ~exclude_client_id:"client-2"
      with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok operations ->
          assert (List.length operations = 1);
          let first = List.hd operations in
          assert (first.client_id = "client-1");
          assert (first.tenant_id = tenant_a);
          assert (first.db_name = db_name)

let assert_insert_duplicate_idempotent () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () ->
      let op = make_op () in
      let first =
        match Sync.Repository.insert_crdt_operation conn op with
        | Error err -> failwith (Sync.Repository.error_to_string err)
        | Ok server_version -> server_version
      in
      let second =
        match Sync.Repository.insert_crdt_operation conn op with
        | Error err -> failwith (Sync.Repository.error_to_string err)
        | Ok server_version -> server_version
      in
      assert (first = second)

let assert_insert_duplicate_mismatch_fails () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () ->
      let op_a = make_op () in
      let op_b = make_op ~value:"{\"title\":\"Walk dog\"}" () in
      (match Sync.Repository.insert_crdt_operation conn op_a with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok _ -> ());
      match Sync.Repository.insert_crdt_operation conn op_b with
      | Ok _ -> failwith "expected consistency violation"
      | Error (Sync.Repository.Crdt_consistency_violation { client_id; version }) ->
          assert (client_id = "client-1");
          assert (version = 1L)
      | Error err ->
          failwith
            ("expected typed consistency violation, got: "
            ^ Sync.Repository.error_to_string err)

let assert_migrates_legacy_set_rows_to_set_row () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () ->
      let legacy_op = make_legacy_set_op () in
      (match Sync.Repository.insert_crdt_operation conn legacy_op with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok _ -> ());
      (match Sync.Repository.init_schema conn with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok () -> ());
      match
        Sync.Repository.get_operations_since conn ~tenant_id:tenant_a ~db_name
          ~server_version:0L ~limit:100 ~exclude_client_id:"client-2"
      with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok operations ->
          let first = List.hd operations in
          assert (first.op_type = "setRow");
          assert (first.field_key = None);
          assert (first.json_value = Some "{\"title\":\"Buy milk\"}")

let assert_migrated_legacy_set_duplicate_is_idempotent () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () ->
      let legacy_op = make_legacy_set_op () in
      let first =
        match Sync.Repository.insert_crdt_operation conn legacy_op with
        | Error err -> failwith (Sync.Repository.error_to_string err)
        | Ok server_version -> server_version
      in
      (match Sync.Repository.init_schema conn with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok () -> ());
      let migrated_client_op = make_op () in
      let second =
        match Sync.Repository.insert_crdt_operation conn migrated_client_op with
        | Error err -> failwith (Sync.Repository.error_to_string err)
        | Ok server_version -> server_version
      in
      assert (first = second)

let assert_same_dot_allowed_across_tenants () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () ->
      let op_a = make_op ~tenant_id:tenant_a () in
      let op_b = make_op ~tenant_id:tenant_b () in
      (match Sync.Repository.insert_crdt_operation conn op_a with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok _ -> ());
      (match Sync.Repository.insert_crdt_operation conn op_b with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok _ -> ());
      match Sync.Repository.count_operations conn ~tenant_id:tenant_b ~db_name with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok count -> assert (count = 1)

let exec_sql conn sql =
  let module Db = (val conn : Caqti_eio.CONNECTION) in
  let open Caqti_request.Infix in
  match Db.exec ((Caqti_type.unit ->. Caqti_type.unit) sql) () with
  | Ok () -> ()
  | Error err -> failwith (Caqti_error.show err)

let assert_migrates_legacy_partition_keys_without_data_loss () =
  with_connection @@ fun conn ->
  exec_sql conn
    {|CREATE TABLE crdt_operations (
      server_version INTEGER PRIMARY KEY AUTOINCREMENT,
      db_name TEXT NOT NULL,
      client_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      row_key TEXT NOT NULL,
      field_key TEXT,
      json_value TEXT,
      version_vector TEXT,
      UNIQUE(db_name, client_id, version)
    )|};
  exec_sql conn
    {|INSERT INTO crdt_operations
      (server_version, db_name, client_id, version, type, table_name, row_key, field_key, json_value, version_vector)
      VALUES (41, 'todos:user-1', 'client-1', 1, 'setRow', 'todos', 'r1', NULL, '{"title":"one"}', NULL),
             (73, 'todos:user-2', 'client-1', 1, 'setRow', 'todos', 'r1', NULL, '{"title":"two"}', NULL)|};
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let assert_partition tenant_id expected_version expected_json =
    match
      Sync.Repository.get_operations_since conn ~tenant_id ~db_name
        ~server_version:0L ~limit:100 ~exclude_client_id:"other-client"
    with
    | Error err -> failwith (Sync.Repository.error_to_string err)
    | Ok [ operation ] ->
        assert (operation.server_version = expected_version);
        assert (operation.tenant_id = tenant_id);
        assert (operation.db_name = db_name);
        assert (operation.json_value = Some expected_json)
    | Ok _ -> failwith "expected exactly one migrated operation in partition"
  in
  assert_partition tenant_a 41L "{\"title\":\"one\"}";
  assert_partition tenant_b 73L "{\"title\":\"two\"}";
  match Sync.Repository.count_operations conn ~tenant_id:tenant_a ~db_name with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok count -> assert (count = 1)

let () =
  assert_init_schema_and_count_empty ();
  assert_insert_and_fetch_operations_since ();
  assert_insert_duplicate_idempotent ();
  assert_insert_duplicate_mismatch_fails ();
  assert_migrates_legacy_set_rows_to_set_row ();
  assert_migrated_legacy_set_duplicate_is_idempotent ();
  assert_same_dot_allowed_across_tenants ();
  assert_migrates_legacy_partition_keys_without_data_loss ()
