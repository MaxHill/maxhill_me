open Sync_engine_core

let hash_parts parts =
  let joined = String.concat "|" parts in
  Digestif.SHA256.digest_string joined |> Digestif.SHA256.to_hex

let hash_sync_request request =
  let parts_rev = ref [] in
  let push value = parts_rev := value :: !parts_rev in

  let push_operation operation =
    let op_type, value, value_key =
      match operation.payload with
      | Set { field; value } -> ("set", Yojson.Safe.to_string value, field)
      | Set_row { value } -> ("setRow", Yojson.Safe.to_string value, "null")
      | Remove _ -> ("remove", "null", "null")
    in

    push operation.row_key;
    push operation.table;
    push op_type;
    push value;
    push value_key;
    push (Int64.to_string operation.dot.version);
    push operation.dot.client_id
  in
  push request.client_id;
  push (Int64.to_string request.last_seen_server_version);
  List.iter push_operation request.operations;
  hash_parts (List.rev !parts_rev)

let hash_sync_response response =
  let parts_rev = ref [] in
  let push value = parts_rev := value :: !parts_rev in
  push (Int64.to_string response.base_server_version);
  push (Int64.to_string response.latest_server_version);
  let push_operation operation =
    push (operation_type operation.payload);
    push operation.table;
    push operation.row_key;
    push operation.dot.client_id;
    push (Int64.to_string operation.dot.version);
    match operation.payload with
    | Set { field; value } ->
        push field;
        push (Yojson.Safe.to_string value)
    | Set_row { value } ->
        push "null";
        push (Yojson.Safe.to_string value)
    | Remove { context } ->
        push "null";
        push "null";
        let sorted_context =
          List.sort (fun (a, _) (b, _) -> String.compare a b) context
        in
        List.iter
          (fun (client_id, version) ->
            push client_id;
            push (Int64.to_string version))
          sorted_context
  in
  List.iter push_operation response.operations;
  List.iter
    (fun (dot : dot) ->
      push dot.client_id;
      push (Int64.to_string dot.version))
    response.synced_operations;
  hash_parts (List.rev !parts_rev)
