type accepted_upload = {
  client_id : string;
  version : int64;
  table_name : string;
  row_key : string;
  operation_signature : string;
  server_version : int64;
}

type removed_dot = {
  client_id : string;
  version : int64;
  table_name : string;
  row_key : string;
  server_version : int64;
}

type t = {
  mutable accepted_uploads : int;
  mutable dropped_responses : int;
  mutable dropped_acks : int;
  mutable explicit_compactions : int;
  mutable removed_original_dots : int;
  mutable retries_before_compaction : int;
  mutable retries_after_compaction : int;
  mutable delete_context_references_removed_dots : int;
  mutable dropped_uploads : accepted_upload list;
  mutable removed_dots : removed_dot list;
}

let create () =
  { accepted_uploads = 0;
    dropped_responses = 0;
    dropped_acks = 0;
    explicit_compactions = 0;
    removed_original_dots = 0;
    retries_before_compaction = 0;
    retries_after_compaction = 0;
    delete_context_references_removed_dots = 0;
    dropped_uploads = [];
    removed_dots = [] }

let operation_signature (operation : Sync.Sync_engine.crdt_operation) =
  match operation.payload with
  | Sync.Sync_engine.Set_row { fields } -> "setRow:" ^ Yojson.Safe.to_string fields
  | Sync.Sync_engine.Remove_row { version_vector } ->
      let sorted = List.sort (fun (a, _) (b, _) -> String.compare a b) version_vector in
      let vector =
        `Assoc
          (List.map
             (fun (client_id, version) ->
               (client_id, `Intlit (Int64.to_string version)))
             sorted)
      in
      "removeRow:" ^ Yojson.Safe.to_string vector
  | Sync.Sync_engine.Checkpoint_row { checkpoint_seen_server_version; state } ->
      "checkpointRow:" ^ Int64.to_string checkpoint_seen_server_version ^ ":"
      ^ Yojson.Safe.to_string state

let same_dot client_id version (operation : Sync.Sync_engine.crdt_operation) =
  operation.dot.client_id = client_id && operation.dot.version = version

let record_acceptances coverage ~(response : Sync.Sync_engine.sync_response) =
  coverage.accepted_uploads <-
    coverage.accepted_uploads + List.length response.synced_operations

let record_response_drop coverage ~(request : Sync.Sync_engine.sync_request)
    ~(response : Sync.Sync_engine.sync_response) =
  coverage.dropped_responses <- coverage.dropped_responses + 1;
  List.iter
    (fun (accepted : Sync.Sync_engine.synced_operation) ->
      coverage.dropped_acks <- coverage.dropped_acks + 1;
      match
        List.find_opt (same_dot accepted.dot.client_id accepted.dot.version)
          request.operations
      with
      | None -> ()
      | Some operation ->
          let upload =
            { client_id = accepted.dot.client_id;
              version = accepted.dot.version;
              table_name = operation.table_name;
              row_key = operation.row_key;
              operation_signature = operation_signature operation;
              server_version = accepted.server_version }
          in
          coverage.dropped_uploads <- upload :: coverage.dropped_uploads)
    response.synced_operations

let record_compaction coverage ~table_name ~row_key
    ~(removed_rows : Sync.Repository.db_crdt_operation list) =
  coverage.explicit_compactions <- coverage.explicit_compactions + 1;
  let original_rows =
    List.filter
      (fun (row : Sync.Repository.db_crdt_operation) ->
        row.Sync.Repository.op_type = "setRow"
        || row.Sync.Repository.op_type = "removeRow")
      removed_rows
  in
  coverage.removed_original_dots <-
    coverage.removed_original_dots + List.length original_rows;
  List.iter
    (fun (row : Sync.Repository.db_crdt_operation) ->
      coverage.removed_dots <-
        { client_id = row.Sync.Repository.client_id;
          version = row.Sync.Repository.version;
          table_name;
          row_key;
          server_version = row.Sync.Repository.server_version }
        :: coverage.removed_dots)
    original_rows

let observe_request coverage ~(request : Sync.Sync_engine.sync_request) =
  List.iter
    (fun (operation : Sync.Sync_engine.crdt_operation) ->
      let matching_dropped =
        List.filter
          (fun (upload : accepted_upload) ->
            same_dot upload.client_id upload.version operation
            && upload.table_name = operation.table_name
            && upload.row_key = operation.row_key
            && upload.operation_signature = operation_signature operation)
          coverage.dropped_uploads
      in
      List.iter
        (fun (upload : accepted_upload) ->
          let compacted =
            List.exists
              (fun (removed : removed_dot) ->
                removed.client_id = upload.client_id
                && removed.version = upload.version
                && removed.table_name = upload.table_name
                && removed.row_key = upload.row_key
                && removed.server_version = upload.server_version)
              coverage.removed_dots
          in
          if compacted then coverage.retries_after_compaction <- coverage.retries_after_compaction + 1
          else coverage.retries_before_compaction <- coverage.retries_before_compaction + 1)
        matching_dropped;
      match operation.payload with
      | Sync.Sync_engine.Remove_row { version_vector } ->
          List.iter
            (fun (client_id, maximum_version) ->
              List.iter
                (fun (removed : removed_dot) ->
                  if removed.client_id = client_id
                     && removed.table_name = operation.table_name
                     && removed.row_key = operation.row_key
                     && removed.version <= maximum_version
                  then
                    coverage.delete_context_references_removed_dots <-
                      coverage.delete_context_references_removed_dots + 1)
                coverage.removed_dots)
            version_vector
      | Sync.Sync_engine.Set_row _ | Sync.Sync_engine.Checkpoint_row _ -> ())
    request.operations

let print_summary coverage ~step =
  let summary =
    `Assoc
      [ ("step", `Int step);
        ("acceptedUploads", `Int coverage.accepted_uploads);
        ("droppedResponses", `Int coverage.dropped_responses);
        ("droppedAcknowledgements", `Int coverage.dropped_acks);
        ("explicitCompactions", `Int coverage.explicit_compactions);
        ("removedOriginalDots", `Int coverage.removed_original_dots);
        ("retriesBeforeCompaction", `Int coverage.retries_before_compaction);
        ("retriesAfterCompaction", `Int coverage.retries_after_compaction);
        ("deleteContextReferencesRemovedDots",
         `Int coverage.delete_context_references_removed_dots) ]
  in
  Printf.eprintf "CHECKPOINT_COVERAGE_SUMMARY %s\n%!" (Yojson.Safe.to_string summary)
