let decode_or_fail raw =
  match Sync.Sync_engine.decode_sync_request raw with
  | Ok request -> request
  | Error msg -> failwith msg

let assert_decode_new_request_shape () =
  let request =
    decode_or_fail
      "{\"protocolVersion\":3,\"clientId\":\"client-1\",\"dbName\":\"main\",\"clientLastMutationID\":0,\"mutations\":[{\"id\":1,\"operation\":{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"title\":\"Buy milk\"},\"dot\":{\"clientId\":\"client-1\",\"version\":1}}}],\"lastSeenServerVersion\":0,\"requestHash\":\"x\"}"
  in
  assert (request.protocol_version = 3);
  assert (request.client_last_mutation_id = 0L);
  assert (List.length request.mutations = 1)

let assert_hash_set_request_golden () =
  let request =
    decode_or_fail
      "{\"protocolVersion\":3,\"clientId\":\"cli-α\",\"dbName\":\"main\",\"clientLastMutationID\":7,\"mutations\":[{\"id\":8,\"operation\":{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"row-1\",\"fields\":{\"z\":0.000001,\"a\":0.0000001,\"é\":9007199254740991,\"nested\":{\"ß\":-0,\"中\":[1.25,2,3.5]}},\"dot\":{\"clientId\":\"cli-α\",\"version\":99}}}],\"lastSeenServerVersion\":123,\"requestHash\":\"x\"}"
  in
  let hash = Sync.Sync_engine.hash_sync_request request in
  let expected = "a954556be2df764901106dce60e5f9a0946327a4fa907f277bcc1f6dba7cedcb" in
  if hash <> expected then failwith ("setRow hash mismatch: " ^ hash)

let assert_hash_remove_request_golden () =
  let request =
    decode_or_fail
      "{\"protocolVersion\":3,\"clientId\":\"cli-α\",\"dbName\":\"main\",\"clientLastMutationID\":8,\"mutations\":[{\"id\":9,\"operation\":{\"type\":\"removeRow\",\"tableName\":\"todos\",\"rowKey\":\"row-1\",\"versionVector\":{\"é\":4,\"a\":2,\"中\":3},\"dot\":{\"clientId\":\"cli-α\",\"version\":100}}}],\"lastSeenServerVersion\":123,\"requestHash\":\"x\"}"
  in
  let hash = Sync.Sync_engine.hash_sync_request request in
  let expected = "00aca8e589967ecf81db5523e2e7ed5503d9c8d1dd4fb2b106bc0946577538bd" in
  if hash <> expected then failwith ("remove hash mismatch: " ^ hash)

let assert_hash_response_golden () =
  let state = Yojson.Safe.from_string
    "{\"fields\":{\"title\":{\"value\":\"Hi\",\"dot\":{\"clientId\":\"client-1\",\"version\":3}},\"numbers\":{\"value\":[0.000001,1e-7,1e20],\"dot\":{\"clientId\":\"client-1\",\"version\":3}}},\"tombstone\":{\"dot\":{\"clientId\":\"deleter\",\"version\":3},\"versionVector\":{\"client-1\":2}}}" in
  let response : Sync.Sync_engine.sync_response = {
    protocol_version = 3; client_id = "reader"; base_server_version = 0L;
    latest_server_version = 9L; last_mutation_id = 4L;
    operations = [{
      table_name = "todos"; row_key = "r1";
      dot = {client_id = "checkpoint:todos:r1"; version = 9L};
      payload = Checkpoint_row {checkpoint_seen_server_version = 8L; state};
    }];
    operation_server_versions = [9L]; response_hash = "";
  } in
  assert (Sync.Sync_engine.hash_sync_response response =
    "87dc05ab1b0b1a0b28433266924ea61c89870c5a496cf402ce7fe9795a7b462f")

let assert_decode_validation_errors () =
  let expect_error raw =
    match Sync.Sync_engine.decode_sync_request raw with
    | Ok _ -> failwith "expected decode error"
    | Error _ -> ()
  in
  expect_error
    "{\"protocolVersion\":3,\"clientId\":\"\",\"dbName\":\"main\",\"clientLastMutationID\":0,\"mutations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"x\"}";
  expect_error
    "{\"protocolVersion\":3,\"clientId\":\"c\",\"dbName\":\"main\",\"clientLastMutationID\":\"nan\",\"mutations\":[],\"lastSeenServerVersion\":0,\"requestHash\":\"x\"}";
  expect_error
    "{\"protocolVersion\":3,\"clientId\":\"c\",\"dbName\":\"main\",\"clientLastMutationID\":0,\"mutations\":[{\"id\":0,\"operation\":{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{},\"dot\":{\"clientId\":\"c\",\"version\":1}}}],\"lastSeenServerVersion\":0,\"requestHash\":\"x\"}";
  expect_error
    "{\"protocolVersion\":3,\"clientId\":\"c\",\"dbName\":\"main\",\"clientLastMutationID\":0,\"mutations\":[{\"id\":1,\"operation\":{\"type\":\"setRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"fields\":{\"a\":1,\"a\":2},\"dot\":{\"clientId\":\"c\",\"version\":1}}}],\"lastSeenServerVersion\":0,\"requestHash\":\"x\"}";
  expect_error
    "{\"protocolVersion\":3,\"clientId\":\"c\",\"dbName\":\"main\",\"clientLastMutationID\":0,\"mutations\":[{\"id\":1,\"operation\":{\"type\":\"removeRow\",\"tableName\":\"todos\",\"rowKey\":\"r1\",\"versionVector\":{\"x\":1,\"x\":2},\"dot\":{\"clientId\":\"c\",\"version\":1}}}],\"lastSeenServerVersion\":0,\"requestHash\":\"x\"}"

let assert_encode_response_shape () =
  let response : Sync.Sync_engine.sync_response =
    { protocol_version = 3;
      client_id = "client-1";
      base_server_version = 0L;
      latest_server_version = 0L;
      last_mutation_id = 0L;
      operations = [];
      operation_server_versions = [];
      response_hash = "h" }
  in
  let json = Yojson.Safe.from_string (Sync.Sync_engine.encode_sync_response response) in
  assert (Yojson.Safe.Util.member "protocolVersion" json = `Int 3);
  assert (Yojson.Safe.Util.member "clientId" json = `String "client-1");
  assert (Yojson.Safe.Util.member "lastMutationID" json = `Int 0)

let () =
  assert_decode_new_request_shape ();
  assert_hash_set_request_golden ();
  assert_hash_remove_request_golden ();
  assert_hash_response_golden ();
  assert_decode_validation_errors ();
  assert_encode_response_shape ()
