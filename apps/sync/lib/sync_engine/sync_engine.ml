include Sync_engine_core

let decode_sync_request = Sync_engine_codec.decode_sync_request
let encode_sync_response = Sync_engine_codec.encode_sync_response
let hash_sync_request = Sync_engine_hash.hash_sync_request
let hash_sync_response = Sync_engine_hash.hash_sync_response
let ( let* ) = Result.bind

let compute_latest_server_version request inserted_versions unseen_rows =
  List.fold_left Int64.max request.last_seen_server_version inserted_versions
  |> fun acc ->
  List.fold_left
    (fun latest row -> Int64.max latest row.Repository.server_version)
    acc unseen_rows

let build_sync_response request ~inserted_versions ~unseen_operations
    ~unseen_rows =
  let response =
    {
      base_server_version = request.last_seen_server_version;
      latest_server_version =
        compute_latest_server_version request inserted_versions unseen_rows;
      operations = unseen_operations;
      synced_operations = List.map (fun op -> op.dot) request.operations;
      response_hash = "";
    }
  in
  { response with response_hash = hash_sync_response response }

let process_sync_request_with_connection connection request =
  let open Sync_engine_validation in
  let* () = ensure_request_hash_valid request in
  Repository.with_transaction connection
    ~map_tx_error:(fun err -> Storage_error (Repository.error_to_string err))
    (fun conn ->
      let* () = ensure_versions_contiguous request.operations in
      let* () = ensure_remove_context_known conn request.operations in

      let* db_operations =
        Sync_engine_persistence.db_operations_of_crdt_operations
          request.operations
      in
      let* inserted_versions =
        Repository.insert_crdt_operations conn db_operations
        |> Result.map_error (fun err ->
            Storage_error (Repository.error_to_string err))
      in

      let* max_server_version =
        Repository.get_max_server_version conn
        |> Result.map_error (fun err ->
            Storage_error (Repository.error_to_string err))
      in
      let* () =
        ensure_client_not_ahead ~last_seen:request.last_seen_server_version
          ~max_server:max_server_version
      in

      let* unseen_rows =
        Repository.get_operations_since conn
          ~server_version:request.last_seen_server_version ~limit:1000
          ~exclude_client_id:request.client_id
        |> Result.map_error (fun err ->
            Storage_error (Repository.error_to_string err))
      in

      let* unseen_operations =
        Sync_engine_persistence.decode_operations unseen_rows
      in

      Ok
        (build_sync_response request ~inserted_versions ~unseen_operations
           ~unseen_rows))
