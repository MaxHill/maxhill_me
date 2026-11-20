include Sync_engine_core

let decode_sync_request = Sync_engine_codec.decode_sync_request
let encode_sync_response = Sync_engine_codec.encode_sync_response
let hash_sync_request = Sync_engine_hash.hash_sync_request
let hash_sync_response = Sync_engine_hash.hash_sync_response
let ( let* ) = Result.bind

let compute_latest_server_version request unseen_rows ~page_limit ~max_server_version =
  if List.length unseen_rows >= page_limit then
    List.fold_left
      (fun latest row -> Int64.max latest row.Repository.server_version)
      request.last_seen_server_version unseen_rows
  else
    max_server_version

let build_sync_response (request : sync_request) ~last_mutation_id ~max_server_version
    ~unseen_operations ~unseen_rows ~page_limit =
  {
    protocol_version = 3;
    client_id = request.client_id;
    base_server_version = request.last_seen_server_version;
    latest_server_version =
      compute_latest_server_version request unseen_rows ~page_limit ~max_server_version;
    last_mutation_id;
    operations = unseen_operations;
    operation_server_versions = [];
    response_hash = "";
  }

let compact_row_with_connection connection ~tenant_id ~db_name ~table_name ~row_key
    ~checkpoint_seen_server_version =
  Repository.with_transaction connection
    ~map_tx_error:(fun err -> Storage_error (Repository.error_to_string err))
    (fun conn ->
      let* rows =
        Repository.get_row_prefix conn ~tenant_id ~db_name ~table_name ~row_key
          ~before_server_version:checkpoint_seen_server_version
        |> Result.map_error (fun err -> Storage_error (Repository.error_to_string err))
      in
      let* operations = Sync_engine_persistence.decode_operations rows in
      let state = Sync_engine_checkpoint.fold operations in
      let* latest =
        Repository.get_max_server_version conn ~tenant_id ~db_name
        |> Result.map_error (fun err -> Storage_error (Repository.error_to_string err))
      in
      if checkpoint_seen_server_version > Int64.succ latest then
        Error (Decode_error "checkpoint coverage boundary exceeds current server prefix")
      else
      let operation =
        { table_name; row_key;
          dot = { client_id = "checkpoint:" ^ table_name ^ ":" ^ row_key;
                 version = Int64.succ latest };
          payload = Checkpoint_row { checkpoint_seen_server_version; state } }
      in
      let* db_operation =
        Sync_engine_persistence.db_operation_of_crdt_operation ~tenant_id ~db_name operation
        |> Result.map_error (fun error -> Decode_error error)
      in
      let* _published_version =
        Repository.insert_crdt_operation conn db_operation
        |> Result.map_error (fun err -> Storage_error (Repository.error_to_string err))
      in
      let* () =
        Repository.delete_row_prefix conn ~tenant_id ~db_name ~table_name ~row_key
          ~before_server_version:checkpoint_seen_server_version
        |> Result.map_error (fun err -> Storage_error (Repository.error_to_string err))
      in
      Ok operation)

let auto_compact_request_rows connection ~tenant_id ~db_name
    ~operation_threshold ~byte_threshold (operations : crdt_operation list) =
  match (operation_threshold, byte_threshold) with
  | None, None -> ()
  | _ ->
      let rows =
        operations
        |> List.map (fun op -> (op.table_name, op.row_key))
        |> List.sort_uniq compare
      in
      let failure_count = ref 0 in
      let first_failure = ref None in
      let record_failure ~table_name ~row_key ~cutoff error =
        incr failure_count;
        if !first_failure = None then
          first_failure := Some (table_name, row_key, cutoff, error)
      in
      List.iter
        (fun (table_name, row_key) ->
          let current_cutoff = ref "unavailable" in
          try
            match Repository.get_max_server_version connection ~tenant_id ~db_name with
            | Error error ->
                record_failure ~table_name ~row_key ~cutoff:!current_cutoff
                  (Repository.error_to_string error)
            | Ok latest ->
                let cutoff = Int64.succ latest in
                current_cutoff := Int64.to_string cutoff;
                (match
                   Repository.get_row_prefix connection ~tenant_id ~db_name ~table_name ~row_key
                     ~before_server_version:cutoff
                 with
                | Error error ->
                    record_failure ~table_name ~row_key ~cutoff:!current_cutoff
                      (Repository.error_to_string error)
                | Ok rows ->
                    let bytes =
                      List.fold_left
                        (fun total row ->
                          total
                          + Option.fold ~none:0 ~some:String.length row.Repository.json_value
                          + Option.fold ~none:0 ~some:String.length row.version_vector)
                        0 rows
                    in
                    let by_count =
                      Option.fold ~none:false ~some:(fun threshold -> List.length rows >= threshold)
                        operation_threshold
                    in
                    let by_bytes =
                      Option.fold ~none:false ~some:(fun threshold -> bytes >= threshold)
                        byte_threshold
                    in
                    if rows <> [] && (by_count || by_bytes) then
                      match
                        compact_row_with_connection connection ~tenant_id ~db_name ~table_name
                          ~row_key ~checkpoint_seen_server_version:cutoff
                      with
                      | Ok _ -> ()
                      | Error error ->
                          record_failure ~table_name ~row_key ~cutoff:!current_cutoff
                            (sync_error_to_string error))
          with exn ->
            record_failure ~table_name ~row_key ~cutoff:!current_cutoff
              (Printexc.to_string exn))
        rows;
      match !first_failure with
      | None -> ()
      | Some (table_name, row_key, cutoff, error) ->
          Logs.warn (fun message ->
              message
                "automatic checkpoint compaction failures=%d tenant=%s db=%s table=%s row=%s cutoff=%s error=%s"
                !failure_count tenant_id db_name table_name row_key cutoff error)

let accept_operation connection ~tenant_id ~db_name (operation : crdt_operation) =
  let map_storage_error error = Storage_error (Repository.error_to_string error) in
  if operation.dot.client_id = "" then Error (Decode_error "missing operation dot.clientId")
  else if operation.dot.version < 0L then Error (Decode_error "dot.version must be >= 0")
  else
    let* db_operation =
      Sync_engine_persistence.db_operation_of_crdt_operation ~tenant_id ~db_name operation
      |> Result.map_error (fun message -> Decode_error message)
    in
    Repository.insert_crdt_operation connection db_operation |> Result.map_error map_storage_error

let process_sync_request_with_connection ?checkpoint_threshold_operations
    ?checkpoint_threshold_bytes connection ~tenant_id ~db_name request =
  let open Sync_engine_validation in
  let* () = ensure_request_hash_valid request in
  let* () = ensure_mutation_request_valid request in
  if request.db_name <> db_name then Error (Decode_error "request database partition mismatch")
  else
  let mutation_ops = List.map (fun (m : mutation) -> m.operation) request.mutations in
  let* response = Repository.with_transaction connection
    ~map_tx_error:(fun err -> Storage_error (Repository.error_to_string err))
    (fun conn ->
      let* client_state =
        Repository.get_or_create_client_state conn ~tenant_id ~db_name ~client_id:request.client_id
        |> Result.map_error (fun err -> Storage_error (Repository.error_to_string err))
      in
      if request.client_last_mutation_id > client_state.last_mutation_id then
        Error (Client_mutation_state_diverged {
          client_last_mutation_id = request.client_last_mutation_id;
          server_last_mutation_id = client_state.last_mutation_id;
        })
      else
      let* new_state =
        List.fold_left (fun acc (mutation : mutation) ->
            let* state = acc in
            if mutation.id <= state.Repository.last_mutation_id then Ok state
            else if mutation.id <> Int64.succ state.Repository.last_mutation_id then
              Error (Client_mutation_gap { expected = Int64.succ state.Repository.last_mutation_id; received = mutation.id })
            else if mutation.operation.dot.version <= state.Repository.last_client_version then
              Error (Logical_clock_regression {
                client_id = request.client_id;
                expected_gt = state.Repository.last_client_version;
                received = mutation.operation.dot.version;
              })
            else
              let* _server_version = accept_operation conn ~tenant_id ~db_name mutation.operation in
              Ok { Repository.last_mutation_id = mutation.id;
                   last_client_version = mutation.operation.dot.version })
          (Ok client_state) request.mutations
      in
      let* () =
        Repository.update_client_state conn ~tenant_id ~db_name ~client_id:request.client_id
          ~last_mutation_id:new_state.last_mutation_id ~last_client_version:new_state.last_client_version
        |> Result.map_error (fun err -> Storage_error (Repository.error_to_string err))
      in
      let* max_server_version =
        Repository.get_max_server_version conn ~tenant_id ~db_name
        |> Result.map_error (fun err -> Storage_error (Repository.error_to_string err))
      in
      let* () =
        ensure_client_not_ahead ~last_seen:request.last_seen_server_version ~max_server:max_server_version
      in
      let page_limit = 1000 in
      let* unseen_rows =
        Repository.get_operations_since conn ~tenant_id ~db_name
          ~server_version:request.last_seen_server_version ~limit:page_limit
          ~exclude_client_id:request.client_id
        |> Result.map_error (fun err -> Storage_error (Repository.error_to_string err))
      in
      let* unseen_operations = Sync_engine_persistence.decode_operations unseen_rows in
      let response =
        build_sync_response request ~last_mutation_id:new_state.last_mutation_id
          ~max_server_version ~unseen_operations ~unseen_rows ~page_limit
      in
      let response =
        { response with
          operation_server_versions = List.map (fun row -> row.Repository.server_version) unseen_rows }
      in
      Ok { response with response_hash = hash_sync_response response })
  in
  auto_compact_request_rows connection ~tenant_id ~db_name
    ~operation_threshold:checkpoint_threshold_operations
    ~byte_threshold:checkpoint_threshold_bytes mutation_ops;
  Ok response
