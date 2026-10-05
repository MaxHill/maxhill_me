let assert_decode_set_operation_request () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"set\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fieldKey\":\"title\",\"jsonValue\":\"Buy milk\",\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Error msg -> failwith ("expected decode success, got error: " ^ msg)
  | Ok request -> (
      match request.operations with
      | [ operation ] -> (
          match operation.payload with
          | Sync.Sync_engine.Set payload ->
              assert (payload.field_key = "title");
              assert (Yojson.Safe.to_string payload.json_value = "\"Buy milk\"")
          | _ -> failwith "expected Set payload")
      | _ -> failwith "expected exactly one operation")

let assert_decode_set_row_operation_request () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Error msg -> failwith ("expected decode success, got error: " ^ msg)
  | Ok request -> (
      match request.operations with
      | [ operation ] -> (
          match operation.payload with
          | Sync.Sync_engine.Set_row payload ->
              assert (Yojson.Safe.to_string payload.fields = "{\"title\":\"Buy milk\"}")
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
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"wrong\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert (Sync.Sync_engine.hash_sync_request request <> request.request_hash)

let assert_decode_remove_operation_request () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"removeRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"versionVector\":{\"client-1\":1,\"client-2\":3},\"dot\":{\"clientId\":\"client-1\",\"version\":2}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Error msg -> failwith ("expected decode success, got error: " ^ msg)
  | Ok request -> (
      match request.operations with
      | [ operation ] -> (
          match operation.payload with
          | Sync.Sync_engine.Remove_row payload ->
              assert (List.assoc "client-1" payload.version_vector = 1L);
              assert (List.assoc "client-2" payload.version_vector = 3L)
          | _ -> failwith "expected Remove_row payload")
      | _ -> failwith "expected exactly one operation")

let assert_reject_set_row_with_field () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fieldKey\":\"title\",\"jsonValue\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Ok _ -> failwith "expected mismatch decode error"
  | Error _ -> ()

let assert_reject_set_with_context () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"set\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fieldKey\":\"title\",\"jsonValue\":\"Buy milk\",\"versionVector\":{\"client-1\":1},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Ok _ -> failwith "expected mismatch decode error"
  | Error _ -> ()

let assert_reject_invalid_db_name () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"bad db\",\"operations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"abc\"}"
  in
  match Sync.Sync_engine.decode_sync_request request_json with
  | Ok _ -> failwith "expected invalid dbName decode error"
  | Error _ -> ()

let assert_hash_sync_request_matches_expected_for_set () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"set\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fieldKey\":\"title\",\"jsonValue\":\"Buy milk\",\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"3f005d177f08ee8c356fda9a8daff40abd7f38abae391f9e91d671d99d599616\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert
    (Sync.Sync_engine.hash_sync_request request
    = "3f005d177f08ee8c356fda9a8daff40abd7f38abae391f9e91d671d99d599616")

let assert_hash_sync_request_matches_expected_for_set_row () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}],\"lastSeenServerVersion\":0,\"requestHash\":\"3bb9f2e08c455c6da0664d246563b8fd2aa6ca4daf31f2eecc18f8b60d3b3605\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert
    (Sync.Sync_engine.hash_sync_request request
    = "3bb9f2e08c455c6da0664d246563b8fd2aa6ca4daf31f2eecc18f8b60d3b3605")

let assert_hash_sync_request_matches_expected_for_remove () =
  let request_json =
    "{\"clientId\":\"client-1\",\"dbName\":\"main\",\"operations\":[{\"type\":\"removeRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"versionVector\":{\"client-1\":1,\"client-2\":3},\"dot\":{\"clientId\":\"client-1\",\"version\":2}}],\"lastSeenServerVersion\":0,\"requestHash\":\"d30be6870a193c65c0dd56409ceed24017197a0d7d325652df6b014bda207b29\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert
    (Sync.Sync_engine.hash_sync_request request
    = "d30be6870a193c65c0dd56409ceed24017197a0d7d325652df6b014bda207b29")

let assert_hash_sync_request_matches_expected_for_multi_operation () =
  let request_json =
    "{\"clientId\":\"client-abc\",\"dbName\":\"main\",\"operations\":[{\"type\":\"set\",\"tableName\":\"posts\",\"rowKey\":\"p1\",\"fieldKey\":\"title\",\"jsonValue\":\"Hello\",\"dot\":{\"clientId\":\"client-abc\",\"version\":6}},{\"type\":\"removeRow\",\"tableName\":\"posts\",\"rowKey\":\"p2\",\"versionVector\":{\"client-abc\":7},\"dot\":{\"clientId\":\"client-abc\",\"version\":7}}],\"lastSeenServerVersion\":5,\"requestHash\":\"436f5aa7e31f6a742ed464f4637aa49d61134b248c31ec5f2d75f4b7fa66b20e\"}"
  in
  let request =
    match Sync.Sync_engine.decode_sync_request request_json with
    | Error msg -> failwith ("unexpected decode error: " ^ msg)
    | Ok value -> value
  in
  assert
    (Sync.Sync_engine.hash_sync_request request
    = "436f5aa7e31f6a742ed464f4637aa49d61134b248c31ec5f2d75f4b7fa66b20e")

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
      Sync.Sync_engine.table_name = "todos";
      row_key = "r1";
      dot = { client_id = "client-1"; version = 1L };
      payload = Set { field_key = "title"; json_value = `String "Buy milk" };
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
      assert (first |> member "fieldKey" |> to_string = "title");
      let keys = first |> to_assoc |> List.map fst in
      assert (not (List.mem "versionVector" keys))
  | _ -> failwith "expected one operation"

let () =
  assert_decode_set_operation_request ();
  assert_decode_set_row_operation_request ();
  assert_decode_remove_operation_request ();
  assert_reject_set_row_with_field ();
  assert_reject_set_with_context ();
  assert_reject_invalid_db_name ();
  assert_hash_sync_response_matches_expected_for_empty_case ();
  assert_hash_sync_request_mismatch_detected ();
  assert_hash_sync_request_matches_expected_for_set ();
  assert_hash_sync_request_matches_expected_for_set_row ();
  assert_hash_sync_request_matches_expected_for_remove ();
  assert_hash_sync_request_matches_expected_for_multi_operation ();
  assert_encode_sync_response_matches_go_bytes_for_empty_case ();
  assert_encode_sync_response_includes_set_operation_shape ()
