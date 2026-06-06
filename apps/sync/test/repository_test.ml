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

let assert_init_schema_and_count_empty () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> (
      match Sync.Repository.count_operations conn with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok count -> assert (count = 0))

let assert_insert_and_fetch_operations_since () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () ->
      let op : Sync.Repository.db_crdt_operation =
        {
          server_version = 0L;
          client_id = "client-1";
          version = 1L;
          op_type = "set";
          table_name = "todos";
          row_key = "r1";
          field = Some "title";
          value = Some "\"Buy milk\"";
          context = None;
        }
      in
      (match Sync.Repository.insert_crdt_operation conn op with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok server_version -> assert (server_version = 1L));
      match
        Sync.Repository.get_operations_since conn ~server_version:0L ~limit:100
          ~exclude_client_id:"client-2"
      with
      | Error err -> failwith (Sync.Repository.error_to_string err)
      | Ok operations ->
          assert (List.length operations = 1);
          let first = List.hd operations in
          assert (first.client_id = "client-1")

let assert_insert_duplicate_idempotent () =
  with_connection @@ fun conn ->
  match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () ->
      let op : Sync.Repository.db_crdt_operation =
        {
          server_version = 0L;
          client_id = "client-1";
          version = 1L;
          op_type = "set";
          table_name = "todos";
          row_key = "r1";
          field = Some "title";
          value = Some "\"Buy milk\"";
          context = None;
        }
      in
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
      let op_a : Sync.Repository.db_crdt_operation =
        {
          server_version = 0L;
          client_id = "client-1";
          version = 1L;
          op_type = "set";
          table_name = "todos";
          row_key = "r1";
          field = Some "title";
          value = Some "\"Buy milk\"";
          context = None;
        }
      in
      let op_b : Sync.Repository.db_crdt_operation =
        { op_a with value = Some "\"Walk dog\"" }
      in
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

let () =
  assert_init_schema_and_count_empty ();
  assert_insert_and_fetch_operations_since ();
  assert_insert_duplicate_idempotent ();
  assert_insert_duplicate_mismatch_fails ()
