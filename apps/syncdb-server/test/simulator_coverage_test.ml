open Sync_simulator

let make_operation ?(payload = Sync.Sync_engine.Set_row { fields = `Assoc [ ("v", `Int 1) ] })
    ~client_id ~version ~row_key () : Sync.Sync_engine.crdt_operation =
  { table_name = "items";
    row_key;
    dot = { client_id; version };
    payload }

let make_request operations request_hash : Sync.Sync_engine.sync_request =
  { client_id = "writer";
    db_name = "main";
    operations;
    last_seen_server_version = 0L;
    request_hash }

let test_lost_ack_retry_and_compacted_delete_classification () =
  let coverage = Coverage.create () in
  let upload = make_operation ~client_id:"writer" ~version:1L ~row_key:"r1" () in
  let request = make_request [ upload ] "original-request" in
  let response : Sync.Sync_engine.sync_response =
    { base_server_version = 0L;
      latest_server_version = 5L;
      operations = [];
      operation_server_versions = [];
      synced_operations =
        [ { dot = upload.dot; server_version = 5L } ];
      response_hash = "response" }
  in
  Coverage.observe_request coverage ~request;
  assert (coverage.retries_before_compaction = 0);
  Coverage.record_acceptances coverage ~response;
  Coverage.record_response_drop coverage ~request ~response;
  let retry = make_request [ upload ] "retry-request" in
  Coverage.observe_request coverage ~request:retry;
  assert (coverage.retries_before_compaction = 1);
  assert (coverage.retries_after_compaction = 0);
  let removed : Sync.Repository.db_crdt_operation =
    { server_version = 5L;
      tenant_id = "sim-user";
      db_name = "main";
      client_id = "writer";
      version = 1L;
      op_type = "setRow";
      table_name = "items";
      row_key = "r1";
      field_key = None;
      json_value = Some "{\"v\":1}";
      version_vector = None }
  in
  Coverage.record_compaction coverage ~table_name:"items" ~row_key:"r1"
    ~removed_rows:[ removed ];
  Coverage.observe_request coverage ~request:retry;
  assert (coverage.retries_after_compaction = 1);
  let delete =
    make_operation ~client_id:"deleter" ~version:1L ~row_key:"r1"
      ~payload:(Sync.Sync_engine.Remove_row { version_vector = [ ("writer", 1L) ] }) ()
  in
  Coverage.observe_request coverage
    ~request:(make_request [ delete ] "delete-request");
  assert (coverage.delete_context_references_removed_dots = 1)

let make_db_row ~server_version ~client_id ~version ~op_type ~json_value =
  ({ server_version;
     tenant_id = "t";
     db_name = "d";
     client_id;
     version;
     op_type;
     table_name = "items";
     row_key = "r";
     field_key = None;
     json_value;
     version_vector = None }
    : Sync.Repository.db_crdt_operation)

let test_prefix_replacement_preserves_tail_and_allows_version_gaps () =
  let prefix = make_db_row ~server_version:1L ~client_id:"a" ~version:1L
      ~op_type:"setRow" ~json_value:(Some "{}") in
  let tail = make_db_row ~server_version:4L ~client_id:"b" ~version:1L
      ~op_type:"setRow" ~json_value:(Some "{}") in
  let checkpoint = make_db_row ~server_version:8L ~client_id:"checkpoint:items:r"
      ~version:8L ~op_type:"checkpointRow"
      ~json_value:(Some "{\"checkpointSeenServerVersion\":4,\"state\":{}}") in
  let valid =
    Simulator_invariants.validate_prefix_replacement ~cutoff:4L
      ~before_rows:[ prefix; tail ] ~after_rows:[ tail; checkpoint ]
      ~checkpoint_client_id:"checkpoint:items:r" ~checkpoint_version:8L
  in
  assert (valid = Ok ());
  assert (Simulator_invariants.versions_strictly_increasing [ 1L; 4L; 8L ]);
  assert (not (Simulator_invariants.versions_strictly_increasing [ 1L; 4L; 4L ]));
  let invalid =
    Simulator_invariants.validate_prefix_replacement ~cutoff:4L
      ~before_rows:[ prefix; tail ] ~after_rows:[ prefix; tail; checkpoint ]
      ~checkpoint_client_id:"checkpoint:items:r" ~checkpoint_version:8L
  in
  match invalid with Error _ -> () | Ok () -> failwith "expected retained prefix to fail validation"

let () =
  test_lost_ack_retry_and_compacted_delete_classification ();
  test_prefix_replacement_preserves_tail_and_allows_version_gaps ()
