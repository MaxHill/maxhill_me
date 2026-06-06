open Sync_engine_core

let db_operation_of_crdt_operation operation =
  match operation.payload with
  | Set { field; value } ->
      Ok
        {
          Repository.server_version = 0L;
          client_id = operation.dot.client_id;
          version = operation.dot.version;
          op_type = "set";
          table_name = operation.table;
          row_key = operation.row_key;
          field = Some field;
          value = Some (Yojson.Safe.to_string value);
          context = None;
        }
  | Set_row { value } ->
      Ok
        {
          Repository.server_version = 0L;
          client_id = operation.dot.client_id;
          version = operation.dot.version;
          op_type = "setRow";
          table_name = operation.table;
          row_key = operation.row_key;
          field = None;
          value = Some (Yojson.Safe.to_string value);
          context = None;
        }
  | Remove { context } ->
      Ok
        {
          Repository.server_version = 0L;
          client_id = operation.dot.client_id;
          version = operation.dot.version;
          op_type = "remove";
          table_name = operation.table;
          row_key = operation.row_key;
          field = None;
          value = None;
          context = Some (canonical_context_json context);
        }

let db_operations_of_crdt_operations operations =
  List.fold_right
    (fun operation acc ->
      match (db_operation_of_crdt_operation operation, acc) with
      | Error msg, _ -> Error (Decode_error msg)
      | Ok _, (Error _ as err) -> err
      | Ok db_operation, Ok db_operations -> Ok (db_operation :: db_operations))
    operations (Ok [])

let crdt_operation_of_db_operation operation =
  match operation.Repository.op_type with
  | "set" -> (
      match (operation.field, operation.value) with
      | Some field, Some value ->
          Ok
            {
              table = operation.table_name;
              row_key = operation.row_key;
              dot =
                { client_id = operation.client_id; version = operation.version };
              payload = Set { field; value = Yojson.Safe.from_string value };
            }
      | _ -> Error "stored set operation missing field/value")
  | "setRow" -> (
      match operation.value with
      | Some value ->
          Ok
            {
              table = operation.table_name;
              row_key = operation.row_key;
              dot =
                { client_id = operation.client_id; version = operation.version };
              payload = Set_row { value = Yojson.Safe.from_string value };
            }
      | None -> Error "stored setRow operation missing value")
  | "remove" -> (
      match operation.context with
      | Some context_json -> (
          match Yojson.Safe.from_string context_json with
          | `Assoc fields ->
              let context =
                List.map
                  (fun (client_id, version_json) ->
                    match version_json with
                    | `Int value -> (client_id, Int64.of_int value)
                    | `Intlit value -> (client_id, Int64.of_string value)
                    | _ ->
                        raise (Invalid_argument "invalid remove context value"))
                  fields
              in
              Ok
                {
                  table = operation.table_name;
                  row_key = operation.row_key;
                  dot =
                    {
                      client_id = operation.client_id;
                      version = operation.version;
                    };
                  payload = Remove { context };
                }
          | _ -> Error "stored remove operation has non-object context")
      | None ->
          Ok
            {
              table = operation.table_name;
              row_key = operation.row_key;
              dot =
                { client_id = operation.client_id; version = operation.version };
              payload = Remove { context = [] };
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
