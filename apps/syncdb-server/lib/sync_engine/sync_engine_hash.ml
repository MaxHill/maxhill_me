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
      | Set { field_key; json_value } ->
          ("set", Yojson.Safe.to_string json_value, field_key)
      | Set_row { fields } -> ("setRow", Yojson.Safe.to_string fields, "null")
      | Remove_row _ -> ("removeRow", "null", "null")
    in

    push operation.row_key;
    push operation.table_name;
    push op_type;
    push value;
    push value_key;
    push (Int64.to_string operation.dot.version);
    push operation.dot.client_id
  in
  push request.client_id;
  push request.db_name;
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
    push operation.table_name;
    push operation.row_key;
    push operation.dot.client_id;
    push (Int64.to_string operation.dot.version);
    match operation.payload with
    | Set { field_key; json_value } ->
        push field_key;
        push (Yojson.Safe.to_string json_value)
    | Set_row { fields } ->
        push "null";
        push (Yojson.Safe.to_string fields)
    | Remove_row { version_vector } ->
        push "null";
        push "null";
        let sorted_version_vector =
          List.sort (fun (a, _) (b, _) -> String.compare a b) version_vector
        in
        List.iter
          (fun (client_id, version) ->
            push client_id;
            push (Int64.to_string version))
          sorted_version_vector
  in
  List.iter push_operation response.operations;
  List.iter
    (fun (dot : dot) ->
      push dot.client_id;
      push (Int64.to_string dot.version))
    response.synced_operations;
  hash_parts (List.rev !parts_rev)
