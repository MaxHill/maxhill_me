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

let make_set_op ~client_id ~dot_version ~row_key =
  { Sync.Sync_engine.table_name = "todos";
    row_key;
    dot = { client_id; version = dot_version };
    payload = Sync.Sync_engine.Set_row { fields = `Assoc [ ("title", `String row_key) ] } }

let make_remove_op ~client_id ~dot_version ~row_key ~version_vector =
  { Sync.Sync_engine.table_name = "todos";
    row_key;
    dot = { client_id; version = dot_version };
    payload = Sync.Sync_engine.Remove_row { version_vector } }

let make_request ~client_id ~db_name ~client_last_mutation_id ~last_seen_server_version ~mutations =
  let request : Sync.Sync_engine.sync_request =
    { protocol_version = 3;
      client_id;
      db_name;
      client_last_mutation_id;
      mutations;
      last_seen_server_version;
      request_hash = "" }
  in
  { request with request_hash = Sync.Sync_engine.hash_sync_request request }

let submit conn ~tenant_id request =
  Sync.Sync_engine.process_sync_request_with_connection conn ~tenant_id
    ~db_name:request.Sync.Sync_engine.db_name request

let submit_ok conn ~tenant_id request =
  match submit conn ~tenant_id request with
  | Ok response -> response
  | Error e -> failwith (Sync.Sync_engine.sync_error_to_string e)

let assert_empty_and_own_only_pull_behavior () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let empty =
    submit_ok conn ~tenant_id:"user-1"
      (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
         ~last_seen_server_version:(-1L) ~mutations:[])
  in
  assert (empty.operations = []);
  assert (empty.latest_server_version = -1L);
  let own_only =
    submit_ok conn ~tenant_id:"user-1"
      (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
         ~last_seen_server_version:(-1L)
         ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:5L ~row_key:"r1" } ])
  in
  assert (own_only.operations = []);
  assert (own_only.last_mutation_id = 1L);
  assert (own_only.latest_server_version >= 0L)

let assert_dense_ids_allow_lamport_gaps () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let response =
    submit_ok conn ~tenant_id:"user-1"
      (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
         ~last_seen_server_version:(-1L)
         ~mutations:[
           { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:1L ~row_key:"r1" };
           { Sync.Sync_engine.id = 2L; operation = make_set_op ~client_id:"c1" ~dot_version:100L ~row_key:"r2" };
         ])
  in
  assert (response.last_mutation_id = 2L)

let assert_duplicate_and_reordered_complete_requests_are_idempotent () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let complete =
    [ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:10L ~row_key:"r1" };
      { Sync.Sync_engine.id = 2L; operation = make_set_op ~client_id:"c1" ~dot_version:20L ~row_key:"r2" } ]
  in
  ignore
    (submit_ok conn ~tenant_id:"user-1"
       (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
          ~last_seen_server_version:(-1L) ~mutations:complete));
  let reordered = List.rev complete in
  let response =
    submit_ok conn ~tenant_id:"user-1"
      (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
         ~last_seen_server_version:(-1L) ~mutations:reordered)
  in
  assert (response.last_mutation_id = 2L);
  match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
  | Ok 2 -> ()
  | _ -> failwith "duplicate complete request should not insert new rows"

let assert_rollback_on_gap_and_storage_failure () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let gap_request =
    make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
      ~last_seen_server_version:(-1L)
      ~mutations:[ { Sync.Sync_engine.id = 2L; operation = make_set_op ~client_id:"c1" ~dot_version:1L ~row_key:"gap" } ]
  in
  (match submit conn ~tenant_id:"user-1" gap_request with
  | Error (Sync.Sync_engine.Client_mutation_gap _) -> ()
  | _ -> failwith "expected mutation gap");
  ignore
    (submit_ok conn ~tenant_id:"user-1"
       (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
          ~last_seen_server_version:(-1L)
          ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:1L ~row_key:"r1" } ]));
  assert
    (Sync.Repository.update_client_state conn ~tenant_id:"user-1" ~db_name:"main" ~client_id:"c1"
       ~last_mutation_id:0L ~last_client_version:0L
    = Ok ());
  let storage_fail =
    make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
      ~last_seen_server_version:(-1L)
      ~mutations:[
        { Sync.Sync_engine.id = 1L;
          operation =
            make_remove_op ~client_id:"c1" ~dot_version:1L ~row_key:"r1"
              ~version_vector:[ ("c1", 1L) ] };
      ]
  in
  (match submit conn ~tenant_id:"user-1" storage_fail with
  | Error (Sync.Sync_engine.Storage_error _) -> ()
  | _ -> failwith "expected storage failure");
  match Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" with
  | Ok 1 -> ()
  | _ -> failwith "failed batch should rollback"

let assert_server_state_divergence_and_logical_rollback () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  ignore
    (submit_ok conn ~tenant_id:"user-1"
       (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
          ~last_seen_server_version:(-1L)
          ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:5L ~row_key:"r1" } ]));
  (match
     submit conn ~tenant_id:"user-1"
       (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:9L
          ~last_seen_server_version:0L ~mutations:[])
   with
  | Error (Sync.Sync_engine.Client_mutation_state_diverged _) -> ()
  | _ -> failwith "expected divergence");
  (match
     submit conn ~tenant_id:"user-1"
       (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:1L
          ~last_seen_server_version:0L
          ~mutations:[ { Sync.Sync_engine.id = 2L; operation = make_set_op ~client_id:"c1" ~dot_version:4L ~row_key:"r2" } ])
   with
  | Error (Sync.Sync_engine.Logical_clock_regression _) -> ()
  | _ -> failwith "expected logical clock regression")

let assert_process_rejects_actor_mismatch_and_checkpoint_uploads () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let mismatch_request : Sync.Sync_engine.sync_request =
    { protocol_version = 3;
      client_id = "c1";
      db_name = "main";
      client_last_mutation_id = 0L;
      last_seen_server_version = -1L;
      request_hash = "";
      mutations =
        [ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c2" ~dot_version:1L ~row_key:"r1" } ] }
  in
  let mismatch_request =
    { mismatch_request with
      request_hash = Sync.Sync_engine.hash_sync_request mismatch_request }
  in
  (match submit conn ~tenant_id:"user-1" mismatch_request with
  | Error (Sync.Sync_engine.Decode_error _) -> ()
  | _ -> failwith "expected actor mismatch decode error");
  let checkpoint_request : Sync.Sync_engine.sync_request =
    { protocol_version = 3;
      client_id = "c1";
      db_name = "main";
      client_last_mutation_id = 0L;
      last_seen_server_version = -1L;
      request_hash = "";
      mutations =
        [ { Sync.Sync_engine.id = 1L;
            operation =
              { Sync.Sync_engine.table_name = "todos";
                row_key = "r1";
                dot = { client_id = "c1"; version = 1L };
                payload =
                  Sync.Sync_engine.Checkpoint_row
                    { checkpoint_seen_server_version = 0L;
                      state = `Assoc [ ("fields", `Assoc []) ] } } } ] }
  in
  let checkpoint_request =
    { checkpoint_request with
      request_hash = Sync.Sync_engine.hash_sync_request checkpoint_request }
  in
  match submit conn ~tenant_id:"user-1" checkpoint_request with
  | Error (Sync.Sync_engine.Decode_error _) -> ()
  | _ -> failwith "expected checkpoint upload rejection"

let assert_partition_isolation () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  ignore
    (submit_ok conn ~tenant_id:"user-1"
       (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
          ~last_seen_server_version:(-1L)
          ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:1L ~row_key:"u1" } ]));
  ignore
    (submit_ok conn ~tenant_id:"user-2"
       (make_request ~client_id:"c2" ~db_name:"main" ~client_last_mutation_id:0L
          ~last_seen_server_version:(-1L)
          ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c2" ~dot_version:1L ~row_key:"u2" } ]));
  let r1 =
    submit_ok conn ~tenant_id:"user-1"
      (make_request ~client_id:"reader" ~db_name:"main" ~client_last_mutation_id:0L
         ~last_seen_server_version:(-1L) ~mutations:[])
  in
  assert (List.length r1.operations = 1);
  assert ((List.hd r1.operations).Sync.Sync_engine.row_key = "u1")

let assert_pull_cursor_full_page_with_own_upload () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let writer_mutations =
    List.init 1001 (fun i ->
      { Sync.Sync_engine.id = Int64.of_int (i + 1);
        operation =
          make_set_op ~client_id:"writer" ~dot_version:(Int64.of_int (i + 1))
            ~row_key:("w" ^ string_of_int i) })
  in
  ignore
    (submit_ok conn ~tenant_id:"user-1"
       (make_request ~client_id:"writer" ~db_name:"main" ~client_last_mutation_id:0L
          ~last_seen_server_version:(-1L) ~mutations:writer_mutations));
  let response =
    submit_ok conn ~tenant_id:"user-1"
      (make_request ~client_id:"reader" ~db_name:"main" ~client_last_mutation_id:0L
         ~last_seen_server_version:(-1L)
         ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"reader" ~dot_version:5000L ~row_key:"mine" } ])
  in
  assert (List.length response.operations = 1000);
  let max_returned =
    List.fold_left Int64.max (-1L) response.operation_server_versions
  in
  assert (response.latest_server_version = max_returned)

let assert_duplicate_after_compaction_with_constant_metadata () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  ignore
    (submit_ok conn ~tenant_id:"user-1"
       (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
          ~last_seen_server_version:(-1L)
          ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:1L ~row_key:"r1" } ]));
  (match
     Sync.Sync_engine.compact_row_with_connection conn ~tenant_id:"user-1" ~db_name:"main"
       ~table_name:"todos" ~row_key:"r1" ~checkpoint_seen_server_version:2L
   with
  | Ok _ -> ()
  | Error e -> failwith (Sync.Sync_engine.sync_error_to_string e));
  let duplicate =
    submit_ok conn ~tenant_id:"user-1"
      (make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:1L
         ~last_seen_server_version:(-1L)
         ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:1L ~row_key:"r1" } ])
  in
  assert (duplicate.last_mutation_id = 1L);
  (match Sync.Repository.get_row_prefix conn ~tenant_id:"user-1" ~db_name:"main"
     ~table_name:"todos" ~row_key:"r1" ~before_server_version:Int64.max_int with
  | Ok [ operation ] -> assert (operation.op_type = "checkpointRow")
  | Ok _ -> failwith "expected only the checkpoint after a compacted mutation retry"
  | Error error -> failwith (Sync.Repository.error_to_string error));
  assert (Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" = Ok 1)

let assert_typed_requests_reject_invalid_counters () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let operation = make_set_op ~client_id:"c1" ~dot_version:0L ~row_key:"r" in
  List.iter (fun (id, client_ack) ->
      let request = make_request ~client_id:"c1" ~db_name:"main"
          ~client_last_mutation_id:client_ack ~last_seen_server_version:(-1L)
          ~mutations:[{Sync.Sync_engine.id; operation}] in
      match submit conn ~tenant_id:"user-1" request with
      | Error (Sync.Sync_engine.Decode_error _) -> ()
      | _ -> failwith "invalid typed mutation counter was not rejected")
    [(0L, 0L); (-1L, 0L); (1L, -1L); (9007199254740992L, 0L)];
  assert (Sync.Repository.count_operations conn ~tenant_id:"user-1" ~db_name:"main" = Ok 0)

let assert_request_hash_errors_preserve_decode_vs_integrity () =
  with_connection @@ fun conn ->
  assert (Sync.Repository.init_schema conn = Ok ());
  let bad_number_request : Sync.Sync_engine.sync_request =
    { protocol_version = 3;
      client_id = "c1";
      db_name = "main";
      client_last_mutation_id = 0L;
      last_seen_server_version = -1L;
      request_hash = "invalid";
      mutations =
        [ { Sync.Sync_engine.id = 1L;
            operation =
              { Sync.Sync_engine.table_name = "todos";
                row_key = "r1";
                dot = { client_id = "c1"; version = 1L };
                payload = Sync.Sync_engine.Set_row { fields = `Assoc [ ("n", `Float nan) ] } } } ] }
  in
  (match submit conn ~tenant_id:"user-1" bad_number_request with
  | Error (Sync.Sync_engine.Decode_error _) -> ()
  | _ -> failwith "expected Decode_error for non-finite canonical input");
  let valid =
    make_request ~client_id:"c1" ~db_name:"main" ~client_last_mutation_id:0L
      ~last_seen_server_version:(-1L)
      ~mutations:[ { Sync.Sync_engine.id = 1L; operation = make_set_op ~client_id:"c1" ~dot_version:1L ~row_key:"r1" } ]
  in
  let corrupted = { valid with request_hash = valid.request_hash ^ "-corrupt" } in
  match submit conn ~tenant_id:"user-1" corrupted with
  | Error Sync.Sync_engine.Request_integrity_failed -> ()
  | _ -> failwith "expected Request_integrity_failed for corrupted request hash"

let () =
  assert_typed_requests_reject_invalid_counters ();
  assert_request_hash_errors_preserve_decode_vs_integrity ();
  assert_empty_and_own_only_pull_behavior ();
  assert_dense_ids_allow_lamport_gaps ();
  assert_duplicate_and_reordered_complete_requests_are_idempotent ();
  assert_rollback_on_gap_and_storage_failure ();
  assert_server_state_divergence_and_logical_rollback ();
  assert_process_rejects_actor_mismatch_and_checkpoint_uploads ();
  assert_partition_isolation ();
  assert_pull_cursor_full_page_with_own_upload ();
  assert_duplicate_after_compaction_with_constant_metadata ()
