let assert_decode_set_operation_request () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"set\",\"table\":\"todos\",\"rowKey\":\"r1\",\"field\":\"title\",\"value\":\"Buy milk\",\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Error msg -> failwith ("expected decode success, got error: " ^ msg)
  | Ok request -> (
      match request.operations with
      | [ operation ] -> (
          match operation.payload with
          | Sync.Sync_engine.Set payload ->
              assert (payload.field = "title");
              assert (Yojson.Safe.to_string payload.value = "\"Buy milk\"")
          | _ -> failwith "expected Set payload")
      | _ -> failwith "expected exactly one operation")

let assert_decode_set_row_operation_request () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"setRow\",\"table\":\"todos\",\"rowKey\":\"r1\",\"value\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Error msg -> failwith ("expected decode success, got error: " ^ msg)
  | Ok request -> (
      match request.operations with
      | [ operation ] -> (
          match operation.payload with
          | Sync.Sync_engine.Set_row payload ->
              assert (Yojson.Safe.to_string payload.value = "{\"title\":\"Buy milk\"}")
          | _ -> failwith "expected Set_row payload")
      | _ -> failwith "expected exactly one operation")

let assert_hash_sync_response_matches_expected_for_empty_case () =
  let response =
    {
      Sync.Sync_engine.base_server_version = 0L;
      latest_server_version = 0L;
      operations = [];
      synced_operations = [];
      response_hash = "";
    }
  in
  assert
    (Sync.Sync_engine.hash_sync_response response
    = "0642c4ea7d881e66f5380be9a70f0ab7644cfd3a87830a074f3ca14fbc42b69c")

let assert_hash_sync_request_mismatch_detected () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"wrong\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert (Sync.Sync_engine.hash_sync_request request <> request.request_hash)

let assert_decode_remove_operation_request () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"remove\",\"table\":\"todos\",\"rowKey\":\"r1\",\"context\":{\"client-1\":1,\"client-2\":3},\"dot\":{\"clientId\":\"client-1\",\"version\":2}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Error msg -> failwith ("expected decode success, got error: " ^ msg)
  | Ok request -> (
      match request.operations with
      | [ operation ] -> (
          match operation.payload with
          | Sync.Sync_engine.Remove payload ->
              assert (List.assoc "client-1" payload.context = 1L);
              assert (List.assoc "client-2" payload.context = 3L)
          | _ -> failwith "expected Remove payload")
      | _ -> failwith "expected exactly one operation")

let assert_reject_set_row_with_field () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"setRow\",\"table\":\"todos\",\"rowKey\":\"r1\",\"field\":\"title\",\"value\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Ok _ -> failwith "expected mismatch decode error"
  | Error _ -> ()

let assert_reject_set_with_context () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"set\",\"table\":\"todos\",\"rowKey\":\"r1\",\"field\":\"title\",\"value\":\"Buy milk\",\"context\":{\"client-1\":1},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Ok _ -> failwith "expected mismatch decode error"
  | Error _ -> ()

let assert_hash_sync_request_matches_expected_for_set () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"set\",\"table\":\"todos\",\"rowKey\":\"r1\",\"field\":\"title\",\"value\":\"Buy milk\",\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"59eb008aa90ac3df9ee29576727b68f50a7b59f03515e2039d356ec89f3e04eb\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert
    (Sync.Sync_engine.hash_sync_request request
    = "59eb008aa90ac3df9ee29576727b68f50a7b59f03515e2039d356ec89f3e04eb")

let assert_hash_sync_request_matches_expected_for_set_row () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"setRow\",\"table\":\"todos\",\"rowKey\":\"r1\",\"value\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"d74778e6e7aba0c1a5912b863e69e9e063339b44eb4924944acea13833e21d5d\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert
    (Sync.Sync_engine.hash_sync_request request
    = "d74778e6e7aba0c1a5912b863e69e9e063339b44eb4924944acea13833e21d5d")

let assert_hash_sync_request_matches_expected_for_remove () =
  let request_json =
    "{\"clientId\":\"client-1\",\"operations\":[{\"type\":\"remove\",\"table\":\"todos\",\"rowKey\":\"r1\",\"context\":{\"client-1\":1,\"client-2\":3},\"dot\":{\"clientId\":\"client-1\",\"version\":2}}],\"lastSeenServerVersion\":0,\"requestHash\":\"e8b7d69fad754ea30b921fd736c378314854ae7656a7a9bd70d530122d8c14e0\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert
    (Sync.Sync_engine.hash_sync_request request
    = "e8b7d69fad754ea30b921fd736c378314854ae7656a7a9bd70d530122d8c14e0")

let assert_hash_sync_request_matches_expected_for_multi_operation () =
  let request_json =
    "{\"clientId\":\"client-abc\",\"operations\":[{\"type\":\"set\",\"table\":\"posts\",\"rowKey\":\"p1\",\"field\":\"title\",\"value\":\"Hello\",\"dot\":{\"clientId\":\"client-abc\",\"version\":6}},{\"type\":\"remove\",\"table\":\"posts\",\"rowKey\":\"p2\",\"context\":{\"client-abc\":7},\"dot\":{\"clientId\":\"client-abc\",\"version\":7}}],\"lastSeenServerVersion\":5,\"requestHash\":\"ce35804f2597ec30774dd6caf6f7be600d9127c0ab90a5846749c642f486d173\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert
    (Sync.Sync_engine.hash_sync_request request
    = "ce35804f2597ec30774dd6caf6f7be600d9127c0ab90a5846749c642f486d173")

let assert_encode_sync_response_matches_go_bytes_for_empty_case () =
  let response =
    {
      Sync.Sync_engine.base_server_version = 0L;
      latest_server_version = 0L;
      operations = [];
      synced_operations = [];
      response_hash = "0642c4ea7d881e66f5380be9a70f0ab7644cfd3a87830a074f3ca14fbc42b69c";
    }
  in
  let encoded = Sync.Sync_engine.encode_sync_response response in
  let expected =
    "{\"baseServerVersion\":0,\"latestServerVersion\":0,\"operations\":[],\"syncedOperations\":[],\"responseHash\":\"0642c4ea7d881e66f5380be9a70f0ab7644cfd3a87830a074f3ca14fbc42b69c\"}"
  in
  assert (encoded = expected)

let assert_encode_sync_response_includes_set_operation_shape () =
  let op =
    {
      Sync.Sync_engine.table = "todos";
      row_key = "r1";
      dot = { client_id = "client-1"; version = 1L };
      payload = Set { field = "title"; value = `String "Buy milk" };
    }
  in
  let response =
    {
      Sync.Sync_engine.base_server_version = 0L;
      latest_server_version = 1L;
      operations = [ op ];
      synced_operations = [ { client_id = "client-1"; version = 1L } ];
      response_hash = "hash";
    }
  in
  let encoded = Sync.Sync_engine.encode_sync_response response in
  let json = Yojson.Safe.from_string encoded in
  let open Yojson.Safe.Util in
  let operations = json |> member "operations" |> to_list in
  match operations with
  | [ first ] ->
      assert (first |> member "type" |> to_string = "set");
      assert (first |> member "field" |> to_string = "title");
      let keys = first |> to_assoc |> List.map fst in
      assert (not (List.mem "context" keys))
  | _ -> failwith "expected one operation"

let () =
  assert_decode_set_operation_request ();
  assert_decode_set_row_operation_request ();
  assert_decode_remove_operation_request ();
  assert_reject_set_row_with_field ();
  assert_reject_set_with_context ();
  assert_hash_sync_response_matches_expected_for_empty_case ();
  assert_hash_sync_request_mismatch_detected ();
  assert_hash_sync_request_matches_expected_for_set ();
  assert_hash_sync_request_matches_expected_for_set_row ();
  assert_hash_sync_request_matches_expected_for_remove ();
  assert_hash_sync_request_matches_expected_for_multi_operation ();
  assert_encode_sync_response_matches_go_bytes_for_empty_case ();
  assert_encode_sync_response_includes_set_operation_shape ()
