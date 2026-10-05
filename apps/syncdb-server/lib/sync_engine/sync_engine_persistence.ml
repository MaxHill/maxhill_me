open Sync_engine_core

let db_operation_of_crdt_operation ~db_name operation =
  match operation.payload with
  | Set_row { fields } ->
      Ok
        {
          Repository.server_version = 0L;
          db_name;
          client_id = operation.dot.client_id;
          version = operation.dot.version;
          op_type = "setRow";
          table_name = operation.table_name;
          row_key = operation.row_key;
          field_key = None;
          json_value = Some (Yojson.Safe.to_string fields);
          version_vector = None;
        }
  | Remove_row { version_vector } ->
      Ok
        {
          Repository.server_version = 0L;
          db_name;
          client_id = operation.dot.client_id;
          version = operation.dot.version;
          op_type = "removeRow";
          table_name = operation.table_name;
          row_key = operation.row_key;
          field_key = None;
          json_value = None;
          version_vector = Some (canonical_version_vector_json version_vector);
        }

let db_operations_of_crdt_operations ~db_name operations =
  List.fold_right
    (fun operation acc ->
      match (db_operation_of_crdt_operation ~db_name operation, acc) with
      | Error msg, _ -> Error (Decode_error msg)
      | Ok _, (Error _ as err) -> err
      | Ok db_operation, Ok db_operations -> Ok (db_operation :: db_operations))
    operations (Ok [])

let crdt_operation_of_db_operation operation =
  match operation.Repository.op_type with
  | "setRow" -> (
      match operation.json_value with
      | Some fields ->
          Ok
            {
              table_name = operation.table_name;
              row_key = operation.row_key;
              dot =
                { client_id = operation.client_id; version = operation.version };
              payload = Set_row { fields = Yojson.Safe.from_string fields };
            }
      | None -> Error "stored setRow operation missing fields")
  | "removeRow" -> (
      match operation.version_vector with
      | Some version_vector_json -> (
          match Yojson.Safe.from_string version_vector_json with
          | `Assoc fields ->
              let version_vector =
                List.map
                  (fun (client_id, version_json) ->
                    match version_json with
                    | `Int value -> (client_id, Int64.of_int value)
                    | `Intlit value -> (client_id, Int64.of_string value)
                    | _ ->
                        raise
                          (Invalid_argument
                             "invalid removeRow versionVector value"))
                  fields
              in
              Ok
                {
                  table_name = operation.table_name;
                  row_key = operation.row_key;
                  dot =
                    {
                      client_id = operation.client_id;
                      version = operation.version;
                    };
                  payload = Remove_row { version_vector };
                }
          | _ -> Error "stored removeRow operation has non-object versionVector")
      | None ->
          Ok
            {
              table_name = operation.table_name;
              row_key = operation.row_key;
              dot =
                { client_id = operation.client_id; version = operation.version };
              payload = Remove_row { version_vector = [] };
            })
  | unknown -> Error ("unknown stored operation type: " ^ unknown)

let decode_operations rows =
  let rec loop acc = function
    | [] -> Ok (List.rev acc)
    | row :: rest -> (
        match crdt_operation_of_db_operation row with
        | Error msg -> Error (Decode_error msg)
        | Ok operation -> loop (operation :: acc) rest)
  in
  loop [] rows
