type accepted_upload = {
  client_id : string;
  version : int64;
  table_name : string;
  row_key : string;
  operation_signature : string;
  server_version : int64;
  accepted_step : int;
  dropped_step : int;
}

type removed_dot = {
  client_id : string;
  version : int64;
  table_name : string;
  row_key : string;
  server_version : int64;
  cutoff : int64;
  removed_step : int;
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

let emit_event name fields =
  let fields = ("event", `String name) :: fields in
  Printf.eprintf "CHECKPOINT_EVIDENCE %s\n%!"
    (Yojson.Safe.to_string (`Assoc fields))

let record_acceptances coverage ~(request : Sync.Sync_engine.sync_request)
    ~(response : Sync.Sync_engine.sync_response) ~step =
  List.iter
    (fun (accepted : Sync.Sync_engine.synced_operation) ->
      coverage.accepted_uploads <- coverage.accepted_uploads + 1;
      emit_event "upload_accepted"
        [ ("step", `Int step);
          ("requestHash", `String request.request_hash);
          ("clientId", `String accepted.dot.client_id);
          ("version", `Intlit (Int64.to_string accepted.dot.version));
          ("serverVersion", `Intlit (Int64.to_string accepted.server_version)) ])
    response.synced_operations

let record_response_drop coverage ~(request : Sync.Sync_engine.sync_request)
    ~(response : Sync.Sync_engine.sync_response) ~step =
  coverage.dropped_responses <- coverage.dropped_responses + 1;
  List.iter
    (fun (accepted : Sync.Sync_engine.synced_operation) ->
      coverage.dropped_acks <- coverage.dropped_acks + 1;
      match
        List.find_opt (same_dot accepted.dot.client_id accepted.dot.version)
          request.operations
      with
      | None ->
          emit_event "dropped_ack_without_request_operation"
            [ ("step", `Int step);
              ("clientId", `String accepted.dot.client_id);
              ("version", `Intlit (Int64.to_string accepted.dot.version)) ]
      | Some operation ->
          let upload =
            { client_id = accepted.dot.client_id;
              version = accepted.dot.version;
              table_name = operation.table_name;
              row_key = operation.row_key;
              operation_signature = operation_signature operation;
              server_version = accepted.server_version;
              accepted_step = step;
              dropped_step = step }
          in
          coverage.dropped_uploads <- upload :: coverage.dropped_uploads;
          emit_event "accepted_upload_response_dropped"
            [ ("step", `Int step);
              ("requestHash", `String request.request_hash);
              ("clientId", `String upload.client_id);
              ("version", `Intlit (Int64.to_string upload.version));
              ("table", `String upload.table_name);
              ("rowKey", `String upload.row_key);
              ("serverVersion", `Intlit (Int64.to_string upload.server_version));
              ("signature", `String upload.operation_signature) ])
    response.synced_operations

let record_compaction coverage ~table_name ~row_key ~cutoff
    ~(removed_rows : Sync.Repository.db_crdt_operation list) ~step =
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
    (fun row ->
      let removed =
        { client_id = row.Sync.Repository.client_id;
          version = row.Sync.Repository.version;
          table_name;
          row_key;
          server_version = row.Sync.Repository.server_version;
          cutoff;
          removed_step = step }
      in
      coverage.removed_dots <- removed :: coverage.removed_dots;
      emit_event "original_dot_compacted"
        [ ("step", `Int step);
          ("clientId", `String removed.client_id);
          ("version", `Intlit (Int64.to_string removed.version));
          ("table", `String table_name);
          ("rowKey", `String row_key);
          ("serverVersion", `Intlit (Int64.to_string removed.server_version));
          ("cutoff", `Intlit (Int64.to_string cutoff)) ])
    original_rows;
  if original_rows = [] then
    emit_event "checkpoint_prefix_compacted_without_original_dots"
      [ ("step", `Int step);
        ("table", `String table_name);
        ("rowKey", `String row_key);
        ("cutoff", `Intlit (Int64.to_string cutoff)) ]

let observe_request coverage ~(request : Sync.Sync_engine.sync_request) ~step =
  List.iter
    (fun operation ->
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
          else coverage.retries_before_compaction <- coverage.retries_before_compaction + 1;
          emit_event
            (if compacted then "retry_of_dropped_ack_after_compaction"
             else "retry_of_dropped_ack_before_compaction")
            [ ("step", `Int step);
              ("requestHash", `String request.request_hash);
              ("acceptedStep", `Int upload.accepted_step);
              ("droppedStep", `Int upload.dropped_step);
              ("clientId", `String upload.client_id);
              ("version", `Intlit (Int64.to_string upload.version));
              ("table", `String upload.table_name);
              ("rowKey", `String upload.row_key);
              ("serverVersion", `Intlit (Int64.to_string upload.server_version));
              ("signature", `String upload.operation_signature) ])
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
                  then (
                    coverage.delete_context_references_removed_dots <-
                      coverage.delete_context_references_removed_dots + 1;
                    emit_event "delete_context_references_compacted_dot"
                      [ ("step", `Int step);
                        ("requestHash", `String request.request_hash);
                        ("deleteClientId", `String operation.dot.client_id);
                        ("deleteVersion", `Intlit (Int64.to_string operation.dot.version));
                        ("referencedClientId", `String removed.client_id);
                        ("referencedVersion", `Intlit (Int64.to_string removed.version));
                        ("table", `String removed.table_name);
                        ("rowKey", `String removed.row_key);
                        ("removedServerVersion", `Intlit (Int64.to_string removed.server_version));
                        ("compactionCutoff", `Intlit (Int64.to_string removed.cutoff));
                        ("versionVectorMaximum", `Intlit (Int64.to_string maximum_version)) ]))
                coverage.removed_dots)
            version_vector
      | Sync.Sync_engine.Set_row _ | Sync.Sync_engine.Checkpoint_row _ -> ())
    request.operations

let record_request_outcome ~(request : Sync.Sync_engine.sync_request) ~step outcome =
  emit_event "observed_request_outcome"
    [ ("step", `Int step);
      ("requestHash", `String request.request_hash);
      ("outcome", `String outcome) ]

let print_summary coverage ~step =
  emit_event "coverage_summary"
    [ ("step", `Int step);
      ("acceptedUploads", `Int coverage.accepted_uploads);
      ("droppedResponses", `Int coverage.dropped_responses);
      ("droppedAcknowledgements", `Int coverage.dropped_acks);
      ("explicitCompactions", `Int coverage.explicit_compactions);
      ("removedOriginalDots", `Int coverage.removed_original_dots);
      ("retriesBeforeCompaction", `Int coverage.retries_before_compaction);
      ("retriesAfterCompaction", `Int coverage.retries_after_compaction);
      ("deleteContextReferencesRemovedDots", `Int coverage.delete_context_references_removed_dots) ]
