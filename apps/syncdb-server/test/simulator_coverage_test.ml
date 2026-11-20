open Sync_simulator

let make_operation ~client_id ~version ~row_key () : Sync.Sync_engine.crdt_operation =
  { table_name = "items";
    row_key;
    dot = { client_id; version };
    payload = Sync.Sync_engine.Set_row { fields = `Assoc [ ("v", `Int 1) ] } }

let make_request mutations : Sync.Sync_engine.sync_request =
  { protocol_version = 3;
    client_id = "writer";
    db_name = "main";
    client_last_mutation_id = 0L;
    mutations;
    last_seen_server_version = 0L;
    request_hash = "x" }

let test_lost_ack_coverage_with_last_mutation_id () =
  let coverage = Coverage.create () in
  let op = make_operation ~client_id:"writer" ~version:1L ~row_key:"r1" () in
  let request = make_request [ { id = 1L; operation = op } ] in
  let response : Sync.Sync_engine.sync_response =
    { protocol_version = 3;
      client_id = "writer";
      base_server_version = 0L;
      latest_server_version = 1L;
      last_mutation_id = 1L;
      operations = [];
      operation_server_versions = [];
      response_hash = "h" }
  in
  Coverage.record_acceptances coverage ~request ~response;
  Coverage.record_response_drop coverage ~request ~response;
  Coverage.observe_request coverage ~request;
  assert (coverage.accepted_uploads = 1);
  assert (coverage.dropped_acks = 1);
  assert (coverage.retries_before_compaction = 1)

let () = test_lost_ack_coverage_with_last_mutation_id ()
