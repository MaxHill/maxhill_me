open Sync_engine_core

let ensure_request_hash_valid request =
  let computed_request_hash = Sync_engine_hash.hash_sync_request request in
  if computed_request_hash = request.request_hash then Ok ()
  else Error Request_integrity_failed

let ensure_client_not_ahead ~last_seen ~max_server =
  if last_seen > max_server then
    Error (Client_state_out_of_sync { last_seen; max_server })
  else Ok ()

let ensure_versions_contiguous operations =
  let module M = Map.Make (String) in
  let add_version acc operation =
    let versions =
      match M.find_opt operation.dot.client_id acc with
      | Some existing -> operation.dot.version :: existing
      | None -> [ operation.dot.version ]
    in
    M.add operation.dot.client_id versions acc
  in
  let grouped = List.fold_left add_version M.empty operations in
  let check_versions client_id versions =
    let sorted = List.sort Int64.compare versions in
    let rec loop = function
      | a :: (b :: _ as rest) ->
          if Int64.succ a = b then loop rest
          else Error (Non_contiguous_versions client_id)
      | _ -> Ok ()
    in
    loop sorted
  in
  grouped |> M.bindings
  |> List.fold_left
       (fun acc (client_id, versions) ->
         match acc with
         | Error _ -> acc
         | Ok () -> check_versions client_id versions)
       (Ok ())

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
        | Remove { context } -> (
            match validate_context context with
            | Error _ as err -> err
            | Ok () -> validate_operations rest)
        | Set _ | Set_row _ -> validate_operations rest)
  in
  validate_operations operations
