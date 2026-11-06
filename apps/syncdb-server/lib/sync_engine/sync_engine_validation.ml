open Sync_engine_core

let ensure_request_hash_valid request =
  let computed_request_hash = Sync_engine_hash.hash_sync_request request in
  if computed_request_hash = request.request_hash then Ok ()
  else Error Request_integrity_failed

let ensure_client_not_ahead ~last_seen ~max_server =
  if last_seen > max_server then
    Error (Client_state_out_of_sync { last_seen; max_server })
  else Ok ()

let ensure_versions_monotonic (operations : crdt_operation list) =
  let module M = Map.Make (String) in
  let check_operation acc (operation : crdt_operation) =
    let client_id = operation.dot.client_id in
    let version = operation.dot.version in
    match M.find_opt client_id acc with
    | Some previous when version <= previous ->
        Error (Non_monotonic_versions client_id)
    | _ -> Ok (M.add client_id version acc)
  in
  operations
  |> List.fold_left
       (fun result operation ->
         match result with
         | Error _ -> result
         | Ok acc -> check_operation acc operation)
       (Ok M.empty)
  |> Result.map ignore
