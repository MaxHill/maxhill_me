let with_connection f =
  Eio_main.run @@ fun env ->
  Eio.Switch.run @@ fun sw ->
  let db_path = Filename.concat (Filename.get_temp_dir_name ()) "sync-engine-int-test.db" in
  (try Unix.unlink db_path with _ -> ());
  let uri = Uri.make ~scheme:"sqlite3" ~path:db_path () in
  match Caqti_eio_unix.connect ~sw ~stdenv:(env :> Caqti_eio.stdenv) uri with
  | Error err -> failwith (Caqti_error.show err)
  | Ok conn ->
      let result = f conn in
      (try Unix.unlink db_path with _ -> ());
      result

let decode_or_fail raw =
  match Sync.Sync_engine.decode_sync_request raw with
  | Error msg -> failwith ("decode failed: " ^ msg)
  | Ok request -> request

let decode_with_valid_hash raw =
  let request = decode_or_fail raw in
  { request with request_hash = Sync.Sync_engine.hash_sync_request request }

let fail_with_sync_error prefix err =
  failwith (prefix ^ Sync.Sync_engine.sync_error_to_string err)

let assert_set_roundtrip_and_fetch_for_second_client () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request_1 =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let response_1 =
    match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request_1 with
    | Error err -> fail_with_sync_error "process request 1 failed: " err
    | Ok response -> response
  in
  assert (response_1.latest_server_version = 1L);
  assert (List.length response_1.synced_operations = 1);
  assert (response_1.operations = []);

  let request_2 =
    decode_with_valid_hash
      "{\"clientId\":\"client-2\",\"dbName\":\"main\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let response_2 =
    match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request_2 with
    | Error err -> fail_with_sync_error "process request 2 failed: " err
    | Ok response -> response
  in
  assert (response_2.latest_server_version = 1L);
  assert (response_2.synced_operations = []);
  match response_2.operations with
  | [ op ] -> (
      match op.payload with
      | Sync.Sync_engine.Set_row payload ->
          assert (op.table_name = "todos");
          assert (op.row_key = "r1");
          assert (Yojson.Safe.to_string payload.fields = "{\"title\":\"Buy milk\"}")
      | _ -> failwith "expected setRow payload")
  | _ -> failwith "expected exactly one unseen operation"

let assert_set_row_roundtrip_and_fetch_for_second_client () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request_1 =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let _response_1 =
    match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request_1 with
    | Error err -> fail_with_sync_error "process setRow request failed: " err
    | Ok response -> response
  in
  let request_2 =
    decode_with_valid_hash
      "{\"clientId\":\"client-2\",\"dbName\":\"main\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let response_2 =
    match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request_2 with
    | Error err -> fail_with_sync_error "process fetch request failed: " err
    | Ok response -> response
  in
  match response_2.operations with
  | [ op ] -> (
      match op.payload with
      | Sync.Sync_engine.Set_row _ -> ()
      | _ -> failwith "expected setRow payload")
  | _ -> failwith "expected exactly one unseen operation"

let assert_remove_roundtrip_and_fetch_for_second_client () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let seed_request =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  (match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" seed_request with
  | Error err -> fail_with_sync_error "seed request failed: " err
  | Ok _ -> ());
  let remove_request =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"removeRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"versionVector\":{\"client-1\":1},\"dot\":{\"clientId\":\"client-1\",\"version\":2}}],\"lastSeenServerVersion\":1,\"requestHash\":\"ignored\"}"
  in
  (match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" remove_request with
  | Error err -> fail_with_sync_error "remove request failed: " err
  | Ok _ -> ());
  let fetch_request =
    decode_with_valid_hash
      "{\"clientId\":\"client-2\",\"dbName\":\"main\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let response =
    match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" fetch_request with
    | Error err -> fail_with_sync_error "fetch request failed: " err
    | Ok response -> response
  in
  assert (List.length response.operations = 2)

let assert_accept_non_contiguous_versions () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"A\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}},{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r2\",\"fields\":{\"title\":\"B\"},\"dot\":{\"clientId\":\"client-1\",\"version\":3}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request with
  | Error err -> fail_with_sync_error "non-contiguous request failed: " err
  | Ok _ -> ()

let assert_reject_versions_that_go_backwards () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"A\"},\"dot\":{\"clientId\":\"client-1\",\"version\":3}},{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r2\",\"fields\":{\"title\":\"B\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request with
  | Error (Sync.Sync_engine.Non_monotonic_versions "client-1") -> ()
  | Error err -> fail_with_sync_error "expected non-monotonic rejection, got: " err
  | Ok _ -> failwith "expected non-monotonic rejection"

let assert_reject_remove_context_unseen_dot () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"removeRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"versionVector\":{\"client-1\":999},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request with
  | Ok _ -> failwith "expected unseen-dot rejection"
  | Error _ -> ()

let assert_tenant_isolation_between_streams () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request_1 =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  (match
     Sync.Sync_engine.process_sync_request_with_connection conn
       ~tenant_id:"user-1" ~db_name:"main" request_1
   with
  | Error err -> fail_with_sync_error "process tenant-1 request failed: " err
  | Ok _ -> ());
  let request_2 =
    decode_with_valid_hash
      "{\"clientId\":\"client-2\",\"dbName\":\"main\",\"operations\":[],\"lastSeenServerVersion\":-1,\"requestHash\":\"ignored\"}"
  in
  let response_2 =
    match
      Sync.Sync_engine.process_sync_request_with_connection conn
        ~tenant_id:"user-2" ~db_name:"main" request_2
    with
    | Error err -> fail_with_sync_error "process tenant-2 request failed: " err
    | Ok response -> response
  in
  assert (response_2.operations = []);
  assert (response_2.latest_server_version = -1L)

let assert_reject_invalid_request_hash () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request =
    decode_or_fail
      "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"wrong\"}"
  in
  match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request with
  | Error Sync.Sync_engine.Request_integrity_failed -> ()
  | Error err ->
      fail_with_sync_error "expected request integrity failure, got: " err
  | Ok _ -> failwith "expected invalid request hash rejection"

let make_request ~client_id ~db_name ~last_seen_server_version ~operations =
  let request : Sync.Sync_engine.sync_request =
    {
      client_id;
      db_name;
      operations;
      last_seen_server_version;
      request_hash = "";
    }
  in
  { request with request_hash = Sync.Sync_engine.hash_sync_request request }

let assert_response_hash_valid (response : Sync.Sync_engine.sync_response) =
  let without_hash = { response with response_hash = "" } in
  let expected = Sync.Sync_engine.hash_sync_response without_hash in
  assert (response.response_hash = expected)

let make_set_row_op ~client_id ~version ~row_key ~title =
  {
    Sync.Sync_engine.table_name = "todos";
    row_key;
    dot = { client_id; version };
    payload = Sync.Sync_engine.Set_row { fields = `Assoc [ ("title", `String title) ] };
  }

let submit_request conn request =
  match
    Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1"
      ~db_name:"main" request
  with
  | Error err -> fail_with_sync_error "sync request failed: " err
  | Ok response ->
      assert_response_hash_valid response;
      response

let seed_remote_ops conn ~count =
  let ops =
    List.init count (fun i ->
        make_set_row_op ~client_id:"remote" ~version:(Int64.of_int (i + 1))
          ~row_key:(Printf.sprintf "remote-%d" (i + 1)) ~title:"remote")
  in
  let response =
    submit_request conn
      (make_request ~client_id:"remote" ~db_name:"main" ~last_seen_server_version:0L
         ~operations:ops)
  in
  assert (List.length response.synced_operations = count);
  response

let pull_once conn ~client_id ~cursor =
  submit_request conn
    (make_request ~client_id ~db_name:"main" ~last_seen_server_version:cursor
       ~operations:[])

let collect_row_keys operations =
  List.map (fun (op : Sync.Sync_engine.crdt_operation) -> op.row_key) operations

let assert_full_only_remote_pagination () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let _ = seed_remote_ops conn ~count:1205 in
  let first = pull_once conn ~client_id:"observer" ~cursor:0L in
  assert (List.length first.operations = 1000);
  assert (first.latest_server_version = 1000L);
  let second = pull_once conn ~client_id:"observer" ~cursor:first.latest_server_version in
  assert (List.length second.operations = 205);
  assert (second.latest_server_version = 1205L);
  let all_keys = collect_row_keys first.operations @ collect_row_keys second.operations in
  let dedup = List.sort_uniq String.compare all_keys in
  assert (List.length all_keys = 1205);
  assert (List.length dedup = 1205)

let assert_remote_pages_not_skipped_after_own_high_uploads () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let _ = seed_remote_ops conn ~count:1205 in
  let own_ops =
    List.init 300 (fun i ->
        make_set_row_op ~client_id:"observer" ~version:(Int64.of_int (i + 1))
          ~row_key:(Printf.sprintf "own-%d" (i + 1)) ~title:"own")
  in
  let first =
    submit_request conn
      (make_request ~client_id:"observer" ~db_name:"main"
         ~last_seen_server_version:0L ~operations:own_ops)
  in
  assert (List.length first.synced_operations = 300);
  assert (List.length first.operations = 1000);
  assert (first.latest_server_version = 1000L);
  let second = pull_once conn ~client_id:"observer" ~cursor:first.latest_server_version in
  assert (List.length second.operations = 205);
  let third = pull_once conn ~client_id:"observer" ~cursor:second.latest_server_version in
  assert (third.operations = []);
  let all_keys =
    collect_row_keys first.operations @ collect_row_keys second.operations
    @ collect_row_keys third.operations
  in
  let dedup = List.sort_uniq String.compare all_keys in
  assert (List.length all_keys = 1205);
  assert (List.length dedup = 1205)

let assert_pagination_boundaries () =
  let run_count count expected_first_count expected_first_latest =
    with_connection @@ fun conn ->
    (match Sync.Repository.init_schema conn with
    | Error err -> failwith (Sync.Repository.error_to_string err)
    | Ok () -> ());
    let _ = seed_remote_ops conn ~count in
    let first = pull_once conn ~client_id:"observer" ~cursor:0L in
    assert (List.length first.operations = expected_first_count);
    assert (first.latest_server_version = expected_first_latest);
    let second =
      pull_once conn ~client_id:"observer" ~cursor:first.latest_server_version
    in
    if count <= 1000 then assert (second.operations = [])
    else assert (List.length second.operations = count - 1000)
  in
  run_count 999 999 999L;
  run_count 1000 1000 1000L;
  run_count 1001 1000 1000L

let assert_empty_and_all_own_pull () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let empty = pull_once conn ~client_id:"solo" ~cursor:(-1L) in
  assert (empty.operations = []);
  assert (empty.latest_server_version = -1L);
  let own_ops =
    List.init 5 (fun i ->
        make_set_row_op ~client_id:"solo" ~version:(Int64.of_int (i + 1))
          ~row_key:(Printf.sprintf "solo-%d" (i + 1)) ~title:"solo")
  in
  let own_response =
    submit_request conn
      (make_request ~client_id:"solo" ~db_name:"main"
         ~last_seen_server_version:(-1L) ~operations:own_ops)
  in
  assert (List.length own_response.synced_operations = 5);
  assert (own_response.operations = []);
  let follow_up =
    pull_once conn ~client_id:"solo" ~cursor:own_response.latest_server_version
  in
  assert (follow_up.operations = [])

let () =
  assert_set_roundtrip_and_fetch_for_second_client ();
  assert_set_row_roundtrip_and_fetch_for_second_client ();
  assert_remove_roundtrip_and_fetch_for_second_client ();
  assert_accept_non_contiguous_versions ();
  assert_reject_versions_that_go_backwards ();
  assert_reject_remove_context_unseen_dot ();
  assert_reject_invalid_request_hash ();
  assert_tenant_isolation_between_streams ();
  assert_full_only_remote_pagination ();
  assert_remote_pages_not_skipped_after_own_high_uploads ();
  assert_pagination_boundaries ();
  assert_empty_and_all_own_pull ()
