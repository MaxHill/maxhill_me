open Sync_engine_core

let ( let* ) = Result.bind

let ensure_mutation_request_valid (request : sync_request) =
  let max_id = 9007199254740991L in
  let in_range value = value >= 0L && value <= max_id in
  if request.protocol_version <> 3 || request.client_id = ""
     || not (in_range request.client_last_mutation_id) then
    Error (Decode_error "invalid mutation request metadata")
  else
    List.fold_left (fun result (mutation : mutation) ->
        let* () = result in
        if mutation.id <= 0L || mutation.id > max_id
           || not (in_range mutation.operation.dot.version)
           || mutation.operation.dot.client_id <> request.client_id then
          Error (Decode_error "invalid mutation id or client identity")
        else match mutation.operation.payload with
        | Checkpoint_row _ -> Error (Decode_error "clients cannot upload checkpointRow")
        | Set_row { fields = (`Assoc _ as fields) } ->
            Sync_engine_hash.validate_strict_json fields
            |> Result.map_error (fun msg -> Decode_error msg)
        | Set_row _ -> Error (Decode_error "setRow fields must be an object")
        | Remove_row { version_vector } ->
            if List.for_all (fun (_, version) -> in_range version) version_vector then
              let vector_json =
                `Assoc
                  (List.map
                     (fun (client_id, version) ->
                       (client_id, `Intlit (Int64.to_string version)))
                     version_vector)
              in
              Sync_engine_hash.validate_strict_json vector_json
              |> Result.map_error (fun msg -> Decode_error msg)
            else Error (Decode_error "invalid remove context version"))
      (Ok ()) request.mutations

let ensure_request_hash_valid request =
  match Sync_engine_hash.hash_sync_request_result request with
  | Error message -> Error (Decode_error message)
  | Ok computed_request_hash ->
      if computed_request_hash = request.request_hash then Ok ()
      else Error Request_integrity_failed

let ensure_client_not_ahead ~last_seen ~max_server =
  if last_seen > max_server then
    Error (Client_state_out_of_sync { last_seen; max_server })
  else Ok ()
