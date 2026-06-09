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
      "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"set\",\"table\":\"todos\",\"rowKey\":\"r1\",\"field\":\"title\",\"value\":\"Buy milk\",\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let response_1 =
    match Sync.Sync_engine.process_sync_request_with_connection conn request_1 with
    | Error err -> fail_with_sync_error "process request 1 failed: " err
    | Ok response -> response
  in
  assert (response_1.latest_server_version = 1L);
  assert (List.length response_1.synced_operations = 1);
  assert (response_1.operations = []);

  let request_2 =
    decode_with_valid_hash
      "{\"clientId\":\"client-2\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let response_2 =
    match Sync.Sync_engine.process_sync_request_with_connection conn request_2 with
    | Error err -> fail_with_sync_error "process request 2 failed: " err
    | Ok response -> response
  in
  assert (response_2.latest_server_version = 1L);
  assert (response_2.synced_operations = []);
  match response_2.operations with
  | [ op ] -> (
      match op.payload with
      | Sync.Sync_engine.Set payload ->
          assert (op.table = "todos");
          assert (op.row_key = "r1");
          assert (payload.field = "title")
      | _ -> failwith "expected set payload")
  | _ -> failwith "expected exactly one unseen operation"

let assert_set_row_roundtrip_and_fetch_for_second_client () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request_1 =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"setRow\",\"table\":\"todos\",\"rowKey\":\"r1\",\"value\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let _response_1 =
    match Sync.Sync_engine.process_sync_request_with_connection conn request_1 with
    | Error err -> fail_with_sync_error "process setRow request failed: " err
    | Ok response -> response
  in
  let request_2 =
    decode_with_valid_hash
      "{\"clientId\":\"client-2\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let response_2 =
    match Sync.Sync_engine.process_sync_request_with_connection conn request_2 with
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
      "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"set\",\"table\":\"todos\",\"rowKey\":\"r1\",\"field\":\"title\",\"value\":\"Buy milk\",\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  (match Sync.Sync_engine.process_sync_request_with_connection conn seed_request with
  | Error err -> fail_with_sync_error "seed request failed: " err
  | Ok _ -> ());
  let remove_request =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"remove\",\"table\":\"todos\",\"rowKey\":\"r1\",\"context\":{\"client-1\":1},\"dot\":{\"clientId\":\"client-1\",\"version\":2}}],\"lastSeenServerVersion\":1,\"requestHash\":\"ignored\"}"
  in
  (match Sync.Sync_engine.process_sync_request_with_connection conn remove_request with
  | Error err -> fail_with_sync_error "remove request failed: " err
  | Ok _ -> ());
  let fetch_request =
    decode_with_valid_hash
      "{\"clientId\":\"client-2\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  let response =
    match Sync.Sync_engine.process_sync_request_with_connection conn fetch_request with
    | Error err -> fail_with_sync_error "fetch request failed: " err
    | Ok response -> response
  in
  assert (List.length response.operations = 2)

let assert_reject_non_contiguous_versions () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"set\",\"table\":\"todos\",\"rowKey\":\"r1\",\"field\":\"title\",\"value\":\"A\",\"dot\":{\"clientId\":\"client-1\",\"version\":1}},{\"type\":\"set\",\"table\":\"todos\",\"rowKey\":\"r2\",\"field\":\"title\",\"value\":\"B\",\"dot\":{\"clientId\":\"client-1\",\"version\":3}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  match Sync.Sync_engine.process_sync_request_with_connection conn request with
  | Ok _ -> failwith "expected non-contiguous rejection"
  | Error _ -> ()

let assert_reject_remove_context_unseen_dot () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request =
    decode_with_valid_hash
      "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"remove\",\"table\":\"todos\",\"rowKey\":\"r1\",\"context\":{\"client-1\":999},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"ignored\"}"
  in
  match Sync.Sync_engine.process_sync_request_with_connection conn request with
  | Ok _ -> failwith "expected unseen-dot rejection"
  | Error _ -> ()

let assert_reject_invalid_request_hash () =
  with_connection @@ fun conn ->
  (match Sync.Repository.init_schema conn with
  | Error err -> failwith (Sync.Repository.error_to_string err)
  | Ok () -> ());
  let request =
    decode_or_fail
      "{\"clientId\":\"client-1\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"wrong\"}"
  in
  match Sync.Sync_engine.process_sync_request_with_connection conn request with
  | Error Sync.Sync_engine.Request_integrity_failed -> ()
  | Error err ->
      fail_with_sync_error "expected request integrity failure, got: " err
  | Ok _ -> failwith "expected invalid request hash rejection"

let () =
  assert_set_roundtrip_and_fetch_for_second_client ();
  assert_set_row_roundtrip_and_fetch_for_second_client ();
  assert_remove_roundtrip_and_fetch_for_second_client ();
  assert_reject_non_contiguous_versions ();
  assert_reject_remove_context_unseen_dot ();
  assert_reject_invalid_request_hash ()
