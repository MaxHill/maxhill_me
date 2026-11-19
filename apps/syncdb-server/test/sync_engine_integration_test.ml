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

let assert_accept_unverified_remove_context () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request =
    decode_with_valid_hash
      "{\"clientId\":\"deleter\",\"dbName\":\"main\",\"operations\":[{\"type\":\"removeRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"versionVector\":{\"never-seen-client\":999},\"dot\":{\"clientId\":\"deleter\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1" ~db_name:"main" request with
  | Error err -> fail_with_sync_error "unverified remove context was rejected: " err
  | Ok response ->
      assert (List.length response.synced_operations = 1);
      (match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
      | Ok 1 -> ()
      | Ok count -> failwith (Printf.sprintf "expected forged delete to be stored, found %d rows" count)
      | Error err -> failwith (Sync.Repository.error_to_string err))

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

let assert_compaction_publishes_checkpoint_and_replaces_prefix () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let original = make_set_row_op ~client_id:"writer" ~version:1L ~row_key:"r1" ~title:"original" in
  let _ = submit_request conn (make_request ~client_id:"writer" ~db_name:"main" ~last_seen_server_version:0L ~operations:[ original ]) in
  let checkpoint =
    match Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1"
      ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
      ~checkpoint_seen_server_version:2L with
    | Error err -> fail_with_sync_error "compaction failed: " err
    | Ok checkpoint -> checkpoint
  in
  (match checkpoint.payload with
  | Sync.Sync_engine.Checkpoint_row { checkpoint_seen_server_version; state } ->
      assert (checkpoint_seen_server_version = 2L);
      let field = Yojson.Safe.Util.member "title" (Yojson.Safe.Util.member "fields" state) in
      assert (Yojson.Safe.Util.member "value" field = `String "original");
      assert (Yojson.Safe.Util.member "dot" field |> Yojson.Safe.Util.member "clientId" |> Yojson.Safe.Util.to_string = "writer")
  | _ -> failwith "expected checkpoint payload");
  (match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
  | Ok 1 -> ()
  | Ok n -> failwith (Printf.sprintf "expected one replacement operation, got %d" n)
  | Error err -> failwith (Sync.Repository.error_to_string err))

let assert_auto_compaction_failure_does_not_fail_sync () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let malformed_old_operation : Sync.Repository.db_crdt_operation =
    { server_version = 0L;
      tenant_id = "user-1";
      db_name = "main";
      client_id = "writer";
      version = 1L;
      op_type = "setRow";
      table_name = "todos";
      row_key = "r1";
      field_key = None;
      json_value = Some "not-json";
      version_vector = None }
  in
  (match Sync.Repository.insert_crdt_operation conn malformed_old_operation with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok _ -> ());
  let operation = make_set_row_op ~client_id:"writer" ~version:2L ~row_key:"r1" ~title:"valid" in
  let request =
    make_request ~client_id:"writer" ~db_name:"main"
      ~last_seen_server_version:1L ~operations:[ operation ]
  in
  (match
     Sync.Sync_engine.process_sync_request_with_connection
       ~checkpoint_threshold_operations:1 conn ~tenant_id:"user-1"
       ~db_name:"main" request
   with
  | Error err -> fail_with_sync_error "auto compaction failure escaped sync: " err
  | Ok response -> assert (List.length response.synced_operations = 1));
  match
    Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1"
      ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
      ~checkpoint_seen_server_version:3L
  with
  | Error _ -> ()
  | Ok _ -> failwith "explicit compaction should report malformed stored operation"

let assert_compacted_retry_is_covered () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let original = make_set_row_op ~client_id:"writer" ~version:100L
      ~row_key:"r1" ~title:"original" in
  let upload = make_request ~client_id:"writer" ~db_name:"main"
      ~last_seen_server_version:(-1L) ~operations:[original] in
  let first = submit_request conn upload in
  assert (first.latest_server_version = 1L);
  let checkpoint =
    match Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1"
      ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
      ~checkpoint_seen_server_version:2L with
    | Error err -> fail_with_sync_error "compaction failed: " err
    | Ok value -> value
  in
  List.iter (fun () ->
      let retry = submit_request conn upload in
      assert (retry.latest_server_version = 2L);
      (match retry.synced_operations with
      | [accepted] ->
          assert (accepted.dot = original.dot);
          assert (accepted.server_version = 2L)
      | _ -> failwith "expected covered retry acknowledgement");
      assert (List.map (fun (op : Sync.Sync_engine.crdt_operation) -> op.dot)
        retry.operations = [checkpoint.dot]);
      match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
      | Ok 1 -> ()
      | Ok count -> failwith (Printf.sprintf "retry inserted another operation: %d" count)
      | Error err -> failwith (Sync.Repository.error_to_string err)) [(); ()];
  let observer = pull_once conn ~client_id:"observer" ~cursor:1L in
  assert (List.map (fun (op : Sync.Sync_engine.crdt_operation) -> op.dot)
    observer.operations = [checkpoint.dot]);
  assert (observer.operation_server_versions = [2L]);
  let conflicting = {original with payload = Set_row {fields = `Assoc [("title", `String "changed")]}} in
  let request = make_request ~client_id:"writer" ~db_name:"main"
      ~last_seen_server_version:(-1L) ~operations:[conflicting] in
  match Sync.Sync_engine.process_sync_request_with_connection conn
      ~tenant_id:"user-1" ~db_name:"main" request with
  | Error (Sync.Sync_engine.Storage_error _) -> ()
  | _ -> failwith "retired-dot membership bypassed a retained field conflict"

let checkpoint_state ~client_id ~version value =
  `Assoc [("fields", `Assoc [("title", `Assoc [
    ("value", value);
    ("dot", `Assoc [("clientId", `String client_id); ("version", `Intlit (Int64.to_string version))])
  ])])]

let with_stored_checkpoint state f =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error error -> failwith (Sync.Repository.error_to_string error)
  | Ok () -> ());
  let checkpoint : Sync.Sync_engine.crdt_operation = {
    table_name = "todos"; row_key = "r1";
    dot = { client_id = "checkpoint"; version = 1000L };
    payload = Checkpoint_row { checkpoint_seen_server_version = 1L; state };
  } in
  ignore (submit_request conn (make_request ~client_id:"checkpoint" ~db_name:"main"
    ~last_seen_server_version:(-1L) ~operations:[checkpoint]));
  f conn

let assert_checkpoint_coverage_case label state
    (operation : Sync.Sync_engine.crdt_operation) covered =
  with_stored_checkpoint state @@ fun conn ->
  let result = submit_request conn (make_request ~client_id:operation.Sync.Sync_engine.dot.client_id
      ~db_name:"main" ~last_seen_server_version:(-1L) ~operations:[operation]) in
  let expected = if covered then 1L else 2L in
  (match result.synced_operations with
  | [accepted] ->
      if accepted.server_version <> expected then failwith ("incorrect coverage: " ^ label);
      assert (accepted.dot = operation.dot)
  | _ -> failwith ("missing acknowledgement: " ^ label));
  assert (result.latest_server_version = expected);
  match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
  | Ok count -> assert (count = Int64.to_int expected)
  | Error error -> failwith (Sync.Repository.error_to_string error)

let assert_checkpoint_write_coverage () =
  let write = make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"value" in
  let state client version value = checkpoint_state ~client_id:client ~version value in
  List.iter (fun (label, snapshot, operation, covered) ->
      assert_checkpoint_coverage_case label snapshot operation covered) [
    ("equal original dot", state "writer" 5L (`String "value"), write, true);
    ("higher original dot", state "writer" 6L (`String "newer"), write, true);
    ("publication version is not coverage", state "writer" 4L (`String "older"), write, false);
    ("large original dot covered at small server version",
      state "writer" 101L (`String "newer"),
      make_set_row_op ~client_id:"writer" ~version:100L ~row_key:"r1" ~title:"value", true);
    ("missing field", `Assoc [("fields", `Assoc [])], write, false);
    ("partly covered fields", state "writer" 5L (`String "value"),
      {write with payload = Set_row {fields = `Assoc [("title", `String "value"); ("body", `String "new")]}},
      false);
    ("incoming wins client tie", state "a" 5L (`String "other"), write, false);
    ("server version cannot cover tie winner", state "a" 0L (`String "other"),
      make_set_row_op ~client_id:"writer" ~version:0L ~row_key:"r1" ~title:"value", false);
    ("checkpoint wins client tie", state "z" 5L (`String "other"), write, true);
    ("numeric int and float", state "writer" 5L (`Int 1),
      {write with payload = Set_row {fields = `Assoc [("title", `Float 1.)]}}, true);
    ("large exact integer and float", state "writer" 5L (`Intlit "100000000000000000000"),
      {write with payload = Set_row {fields = `Assoc [("title", `Float 1e20)]}}, true);
    ("object key order", state "writer" 5L (`Assoc [("a", `Int 1); ("b", `List [`Bool true])]),
      {write with payload = Set_row {fields = `Assoc [
        ("title", `Assoc [("b", `List [`Bool true]); ("a", `Int 1)])]}}, true);
  ]

let tombstone_state dot_version vector =
  `Assoc [("fields", `Assoc []); ("tombstone", `Assoc [
    ("dot", `Assoc [("clientId", `String "deleter"); ("version", `Intlit (Int64.to_string dot_version))]);
    ("versionVector", `Assoc (List.map (fun (client, version) ->
        client, `Intlit (Int64.to_string version)) vector))])]

let assert_checkpoint_delete_coverage () =
  let remove version vector : Sync.Sync_engine.crdt_operation = {
    table_name = "todos"; row_key = "r1"; dot = {client_id = "deleter"; version};
    payload = Remove_row {version_vector = vector};
  } in
  let snapshot = tombstone_state 6L [("writer", 5L)] in
  List.iter (fun (label, state, operation, covered) ->
      assert_checkpoint_coverage_case label state operation covered) [
    ("covered remove", snapshot, remove 5L [("writer", 5L)], true);
    ("uncovered vector", snapshot, remove 5L [("writer", 6L)], false);
    ("unseen vector client", snapshot, remove 5L [("unknown", 1L)], false);
    ("newer remove dot", snapshot, remove 7L [("writer", 5L)], false);
    ("no tombstone", `Assoc [("fields", `Assoc [])], remove 5L [], false);
    ("tombstone covers write", snapshot,
      make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"old", true);
    ("tombstone does not cover write", snapshot,
      make_set_row_op ~client_id:"writer" ~version:6L ~row_key:"r1" ~title:"new", false);
  ]

let assert_checkpoint_conflict_rolls_back () =
  let snapshot = checkpoint_state ~client_id:"writer" ~version:5L (`String "original") in
  with_stored_checkpoint snapshot @@ fun conn ->
  let covered = make_set_row_op ~client_id:"writer" ~version:3L ~row_key:"r1" ~title:"older" in
  let valid = make_set_row_op ~client_id:"writer" ~version:4L ~row_key:"other" ~title:"valid" in
  (* The missing field comes first: it must not hide the later equal-dot conflict. *)
  let conflict = { (make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"changed")
    with payload = Set_row {fields = `Assoc [("missing", `Int 1); ("title", `String "changed")]} } in
  let request = make_request ~client_id:"writer" ~db_name:"main"
    ~last_seen_server_version:(-1L) ~operations:[covered; valid; conflict] in
  (match Sync.Sync_engine.process_sync_request_with_connection conn
      ~tenant_id:"user-1" ~db_name:"main" request with
  | Error (Sync.Sync_engine.Storage_error _) -> ()
  | Error error -> fail_with_sync_error "unexpected conflict: " error
  | Ok _ -> failwith "expected equal-dot conflict");
  assert (Sync.Repository.find_checkpoint_dot conn ~tenant_id:"user-1" ~db_name:"main"
    ~client_id:"writer" ~version:3L = Ok None);
  match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
  | Ok count -> assert (count = 1)
  | Error error -> failwith (Sync.Repository.error_to_string error)

let assert_checkpoint_live_dot_precedes_coverage () =
  with_stored_checkpoint (checkpoint_state ~client_id:"writer" ~version:5L (`String "snapshot"))
  @@ fun conn ->
  let retained : Sync.Repository.db_crdt_operation = {
    server_version = 0L; tenant_id = "user-1"; db_name = "main";
    client_id = "writer"; version = 5L; op_type = "setRow";
    table_name = "todos"; row_key = "r1"; field_key = None;
    json_value = Some "{\"title\":\"retained\"}"; version_vector = None;
  } in
  (match Sync.Repository.insert_crdt_operation conn retained with
  | Ok _ -> () | Error error -> failwith (Sync.Repository.error_to_string error));
  let request title = make_request ~client_id:"writer" ~db_name:"main"
    ~last_seen_server_version:(-1L) ~operations:[
      make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title] in
  let retry = submit_request conn (request "retained") in
  assert ((List.hd retry.synced_operations).server_version = 2L);
  match Sync.Sync_engine.process_sync_request_with_connection conn
      ~tenant_id:"user-1" ~db_name:"main" (request "snapshot") with
  | Error (Sync.Sync_engine.Storage_error _) -> ()
  | _ -> failwith "checkpoint bypassed a retained-dot payload conflict"

let assert_checkpoint_mixed_acceptance () =
  with_stored_checkpoint (checkpoint_state ~client_id:"writer" ~version:5L (`String "value"))
  @@ fun conn ->
  let operations = [
    make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"value";
    make_set_row_op ~client_id:"writer" ~version:6L ~row_key:"new" ~title:"new";
  ] in
  let response = submit_request conn (make_request ~client_id:"writer" ~db_name:"main"
    ~last_seen_server_version:(-1L) ~operations) in
  assert (List.map (fun (ack : Sync.Sync_engine.synced_operation) -> ack.server_version)
    response.synced_operations = [1L; 2L]);
  assert (List.map (fun (ack : Sync.Sync_engine.synced_operation) -> ack.dot.version)
    response.synced_operations = [5L; 6L])

let assert_checkpoint_partition_isolation () =
  List.iter (fun (tenant_id, db_name) ->
    with_stored_checkpoint (checkpoint_state ~client_id:"writer" ~version:5L (`String "value"))
    @@ fun conn ->
    let operation = make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"value" in
    let request = make_request ~client_id:"writer" ~db_name
        ~last_seen_server_version:(-1L) ~operations:[operation] in
    match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id ~db_name request with
    | Error error -> fail_with_sync_error "isolated request failed: " error
    | Ok response ->
        assert ((List.hd response.synced_operations).server_version = 2L);
        assert (response.operations = []))
    [("other-user", "main"); ("user-1", "other-db")];
  let operation = make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"value" in
  let state = checkpoint_state ~client_id:"writer" ~version:5L (`String "value") in
  assert_checkpoint_coverage_case "other table" state {operation with table_name = "other"} false;
  assert_checkpoint_coverage_case "other row" state {operation with row_key = "other"} false

let assert_malformed_checkpoint_is_not_coverage () =
  List.iter (fun state ->
    with_stored_checkpoint state @@ fun conn ->
    let operation = make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"value" in
    let request = make_request ~client_id:"writer" ~db_name:"main"
        ~last_seen_server_version:(-1L) ~operations:[operation] in
    match Sync.Sync_engine.process_sync_request_with_connection conn
        ~tenant_id:"user-1" ~db_name:"main" request with
    | Error (Sync.Sync_engine.Decode_error _) -> ()
    | _ -> failwith "malformed checkpoint was treated as coverage")
    [`Assoc [("fields", `String "broken")];
     `Assoc [("fields", `Assoc [("title", `Assoc [("value", `String "value")])])];
     `Assoc [("fields", `Assoc []); ("tombstone", `Null)]]

let assert_covered_upload_does_not_skip_pages () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error error -> failwith (Sync.Repository.error_to_string error)
  | Ok () -> ());
  let operation = make_set_row_op ~client_id:"writer" ~version:5000L
      ~row_key:"r1" ~title:"value" in
  let request = make_request ~client_id:"writer" ~db_name:"main"
      ~last_seen_server_version:0L ~operations:[operation] in
  ignore (submit_request conn request);
  ignore (seed_remote_ops conn ~count:1205);
  (match Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1"
      ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
      ~checkpoint_seen_server_version:1207L with
  | Error error -> fail_with_sync_error "compaction failed: " error
  | Ok _ -> ());
  let first = submit_request conn request in
  assert ((List.hd first.synced_operations).server_version = 1207L);
  assert (List.length first.operations = 1000);
  assert (first.latest_server_version = 1001L);
  let second = pull_once conn ~client_id:"writer" ~cursor:first.latest_server_version in
  assert (List.length second.operations = 206);
  assert (second.latest_server_version = 1207L);
  let keys = collect_row_keys first.operations @ collect_row_keys second.operations in
  assert (List.length (List.sort_uniq String.compare keys) = 1206)

let assert_covered_ack_client_contract () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error error -> failwith (Sync.Repository.error_to_string error)
  | Ok () -> ());
  let operation = make_set_row_op ~client_id:"reader" ~version:0L
      ~row_key:"r1" ~title:"original" in
  let request = make_request ~client_id:"reader" ~db_name:"main"
      ~last_seen_server_version:(-1L) ~operations:[operation] in
  ignore (submit_request conn request);
  let compact cutoff =
    match Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1"
        ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
        ~checkpoint_seen_server_version:cutoff with
    | Error error -> fail_with_sync_error "compaction failed: " error
    | Ok _ -> ()
  in
  compact 2L;
  let covered = submit_request conn request in
  assert ((List.hd covered.synced_operations).server_version = 2L);
  assert (covered.latest_server_version = 2L);
  compact 3L;
  let cleanup = pull_once conn ~client_id:"reader" ~cursor:2L in
  assert (cleanup.latest_server_version = 3L)

let assert_compacted_remove_retry_is_covered () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error error -> failwith (Sync.Repository.error_to_string error)
  | Ok () -> ());
  let write = make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"value" in
  ignore (submit_request conn (make_request ~client_id:"writer" ~db_name:"main"
      ~last_seen_server_version:(-1L) ~operations:[write]));
  let remove : Sync.Sync_engine.crdt_operation = {
    table_name = "todos"; row_key = "r1"; dot = {client_id = "deleter"; version = 6L};
    payload = Remove_row {version_vector = [("writer", 5L)]};
  } in
  let request = make_request ~client_id:"deleter" ~db_name:"main"
      ~last_seen_server_version:1L ~operations:[remove] in
  ignore (submit_request conn request);
  (match Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1"
      ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
      ~checkpoint_seen_server_version:3L with
  | Ok _ -> () | Error error -> fail_with_sync_error "remove compaction failed: " error);
  let retried = submit_request conn request in
  assert ((List.hd retried.synced_operations).server_version = 3L);
  assert (retried.latest_server_version = 3L);
  assert (List.length retried.operations = 1);
  match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
  | Ok 1 -> () | _ -> failwith "covered delete retry grew the operation log"

let assert_checkpoint_json_conflicts () =
  List.iter (fun (stored, incoming) ->
    with_stored_checkpoint (checkpoint_state ~client_id:"writer" ~version:5L stored)
    @@ fun conn ->
    let operation = { (make_set_row_op ~client_id:"writer" ~version:5L ~row_key:"r1" ~title:"unused")
      with payload = Set_row {fields = `Assoc [("title", incoming)]} } in
    let request = make_request ~client_id:"writer" ~db_name:"main"
        ~last_seen_server_version:(-1L) ~operations:[operation] in
    match Sync.Sync_engine.process_sync_request_with_connection conn
        ~tenant_id:"user-1" ~db_name:"main" request with
    | Error (Sync.Sync_engine.Storage_error _) -> ()
    | _ -> failwith "unequal JSON at an equal dot was not rejected") [
      (`List [`Int 1; `Int 2], `List [`Int 2; `Int 1]);
      (`Int 1, `String "1");
      (`Intlit "9007199254740993", `Float 9007199254740992.);
    ]

let assert_overwritten_deleted_dot_retry_is_covered () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error error -> failwith (Sync.Repository.error_to_string error)
  | Ok () -> ());
  let original = make_set_row_op ~client_id:"a" ~version:53L ~row_key:"r1" ~title:"old" in
  let upload (operation : Sync.Sync_engine.crdt_operation) = submit_request conn (make_request
      ~client_id:operation.dot.client_id ~db_name:"main"
      ~last_seen_server_version:(-1L) ~operations:[operation]) in
  ignore (upload original);
  ignore (upload (make_set_row_op ~client_id:"b" ~version:149L ~row_key:"r1" ~title:"new"));
  let remove : Sync.Sync_engine.crdt_operation = {
    table_name = "todos"; row_key = "r1"; dot = {client_id = "b"; version = 151L};
    payload = Remove_row {version_vector = [("b", 149L)]};
  } in
  ignore (upload remove);
  (match Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1"
      ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
      ~checkpoint_seen_server_version:4L with
  | Error error -> fail_with_sync_error "compaction failed: " error | Ok _ -> ());
  let retry = upload original in
  assert (retry.latest_server_version = 4L);
  assert ((List.hd retry.synced_operations).server_version = 4L);
  List.iter (fun cutoff ->
      (match Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1"
          ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
          ~checkpoint_seen_server_version:cutoff with
      | Error error -> fail_with_sync_error "repeat compaction failed: " error | Ok _ -> ());
      let retry = upload original in
      assert ((List.hd retry.synced_operations).server_version = cutoff);
      assert (Sync.Repository.has_operation_dot conn ~tenant_id:"user-1" ~db_name:"main"
        ~client_id:"a" ~version:53L = Ok false)) [5L; 6L];
  (match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
  | Ok 1 -> () | _ -> failwith "forgotten accepted dot was inserted again");
  let moved = {original with row_key = "other"} in
  let moved_request = make_request ~client_id:"a" ~db_name:"main"
      ~last_seen_server_version:(-1L) ~operations:[moved] in
  (match Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id:"user-1"
      ~db_name:"main" moved_request with
  | Error (Sync.Sync_engine.Storage_error _) -> ()
  | _ -> failwith "retired identity was rebound to another row");
  let unseen = {original with dot = {client_id = "a"; version = 52L};
      payload = Set_row {fields = `Assoc [("extra", `String "offline")]}} in
  let accepted = upload unseen in
  assert ((List.hd accepted.synced_operations).server_version = 7L)

let assert_covered_only_ack_retains_identity () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error error -> failwith (Sync.Repository.error_to_string error) | Ok () -> ());
  let upload (operation : Sync.Sync_engine.crdt_operation) = submit_request conn (make_request
      ~client_id:operation.dot.client_id ~db_name:"main"
      ~last_seen_server_version:(-1L) ~operations:[operation]) in
  let compact cutoff = match Sync.Sync_engine.compact_row_with_connection conn
      ~tenant_id:"user-1" ~db_name:"main" ~table_name:"todos" ~row_key:"r1"
      ~checkpoint_seen_server_version:cutoff with
    | Error error -> fail_with_sync_error "compaction failed: " error | Ok _ -> () in
  ignore (upload (make_set_row_op ~client_id:"a" ~version:10L ~row_key:"r1" ~title:"current"));
  compact 2L;
  let covered = make_set_row_op ~client_id:"a" ~version:5L ~row_key:"r1" ~title:"older" in
  assert ((List.hd (upload covered).synced_operations).server_version = 2L);
  assert (Sync.Repository.has_operation_dot conn ~tenant_id:"user-1" ~db_name:"main"
    ~client_id:"a" ~version:5L = Ok false);
  assert (Sync.Repository.find_checkpoint_dot conn ~tenant_id:"user-1" ~db_name:"main"
    ~client_id:"a" ~version:6L = Ok None);
  ignore (upload (make_set_row_op ~client_id:"b" ~version:20L ~row_key:"r1" ~title:"new"));
  let remove : Sync.Sync_engine.crdt_operation = {
    table_name = "todos"; row_key = "r1"; dot = {client_id = "b"; version = 21L};
    payload = Remove_row {version_vector = [("b", 20L)]};
  } in
  ignore (upload remove);
  compact 5L;
  let retry = upload covered in
  assert ((List.hd retry.synced_operations).server_version = 5L);
  match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
  | Ok 1 -> () | _ -> failwith "covered-only identity was forgotten"

let () =
  assert_covered_only_ack_retains_identity ();
  assert_overwritten_deleted_dot_retry_is_covered ();
  assert_compacted_remove_retry_is_covered ();
  assert_checkpoint_json_conflicts ();
  assert_checkpoint_live_dot_precedes_coverage ();
  assert_checkpoint_mixed_acceptance ();
  assert_checkpoint_partition_isolation ();
  assert_malformed_checkpoint_is_not_coverage ();
  assert_covered_upload_does_not_skip_pages ();
  assert_covered_ack_client_contract ();
  assert_compacted_retry_is_covered ();
  assert_checkpoint_write_coverage ();
  assert_checkpoint_delete_coverage ();
  assert_checkpoint_conflict_rolls_back ();
  assert_compaction_publishes_checkpoint_and_replaces_prefix ();
  assert_auto_compaction_failure_does_not_fail_sync ();
  assert_set_roundtrip_and_fetch_for_second_client ();
  assert_set_row_roundtrip_and_fetch_for_second_client ();
  assert_remove_roundtrip_and_fetch_for_second_client ();
  assert_accept_non_contiguous_versions ();
  assert_reject_versions_that_go_backwards ();
  assert_accept_unverified_remove_context ();
  assert_reject_invalid_request_hash ();
  assert_tenant_isolation_between_streams ();
  assert_full_only_remote_pagination ();
  assert_remote_pages_not_skipped_after_own_high_uploads ();
  assert_pagination_boundaries ();
  assert_empty_and_all_own_pull ()
