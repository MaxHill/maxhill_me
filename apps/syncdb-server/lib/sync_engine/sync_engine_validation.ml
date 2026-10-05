open Sync_engine_core

let ensure_request_hash_valid request =
  let computed_request_hash = Sync_engine_hash.hash_sync_request request in
  if computed_request_hash = request.request_hash then Ok ()
  else Error Request_integrity_failed

let ensure_client_not_ahead ~last_seen ~max_server =
  if last_seen > max_server then
    Error (Client_state_out_of_sync { last_seen; max_server })
  else Ok ()

let ensure_versions_monotonic operations =
  let module M = Map.Make (String) in
  let check_operation acc operation =
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

let ensure_remove_context_known connection ~db_name operations =
  let known_in_request = incoming_dot_set operations in
  let rec validate_context = function
    | [] -> Ok ()
    | (client_id, version) :: rest -> (
        let key = Printf.sprintf "%s#%Ld" client_id version in
        if List.mem key known_in_request then validate_context rest
        else
          match
            Repository.has_operation_dot connection ~db_name ~client_id ~version
          with
          | Error err -> Error (Storage_error (Repository.error_to_string err))
          | Ok true -> validate_context rest
          | Ok false -> Error (Remove_context_unseen_dot { client_id; version })
        )
  in
  let rec validate_operations = function
    | [] -> Ok ()
    | operation :: rest -> (
        match operation.payload with
        | Remove_row { version_vector } -> (
            match validate_context version_vector with
            | Error _ as err -> err
            | Ok () -> validate_operations rest)
        | Set_row _ -> validate_operations rest)
  in
  validate_operations operations
