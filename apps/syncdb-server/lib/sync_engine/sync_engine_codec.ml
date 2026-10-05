open Sync_engine_core

let ( let* ) = Result.bind

let decode_dot json =
  let open Yojson.Safe.Util in
  let client_id = json |> member "clientId" |> to_string in
  let version = json |> member "version" |> int64_of_json in
  { client_id; version }

let decode_operation json =
  let open Yojson.Safe.Util in
  let operation_type = json |> member "type" |> to_string in
  let table_name = json |> member "tableName" |> to_string in
  let row_key = json |> member "rowKey" |> to_string in
  let dot = json |> member "dot" |> decode_dot in
  match operation_type with
  | "set" -> Error "unsupported operation type: set"
  | "setRow" ->
      if
        (not (has_key "fields" json))
        || has_key "fieldKey" json || has_key "jsonValue" json
        || has_key "versionVector" json || has_key "table" json
        || has_key "field" json || has_key "value" json || has_key "context" json
      then Error "setRow payload shape mismatch"
      else
        let fields = json |> member "fields" in
        Ok { table_name; row_key; dot; payload = Set_row { fields } }
  | "removeRow" ->
      if
        (not (has_key "versionVector" json))
        || has_key "fieldKey" json || has_key "jsonValue" json
        || has_key "fields" json || has_key "table" json || has_key "field" json
        || has_key "value" json || has_key "context" json
      then Error "removeRow payload shape mismatch"
      else
        let version_vector_json = json |> member "versionVector" |> to_assoc in
        let version_vector =
          List.map
            (fun (client_id, version_json) ->
              (client_id, int64_of_json version_json))
            version_vector_json
        in
        Ok { table_name; row_key; dot; payload = Remove_row { version_vector } }
  | _ -> Error ("unsupported operation type: " ^ operation_type)

let decode_sync_request raw =
  let open Yojson.Safe.Util in
  try
    let json = Yojson.Safe.from_string raw in
    let client_id = json |> member "clientId" |> to_string in
    let db_name = json |> member "dbName" |> to_string in
    let operations_json = json |> member "operations" |> to_list in
    let rec decode_all acc = function
      | [] -> Ok (List.rev acc)
      | operation_json :: rest -> (
          match decode_operation operation_json with
          | Error msg -> Error msg
          | Ok operation -> decode_all (operation :: acc) rest)
    in
    match decode_all [] operations_json with
    | Error msg -> Error msg
    | Ok operations ->
        let last_seen_server_version =
          json |> member "lastSeenServerVersion" |> int64_of_json
        in
        let request_hash = json |> member "requestHash" |> to_string in
        let* db_name = Db_name.validate db_name in
        Ok { client_id; db_name; operations; last_seen_server_version; request_hash }
  with
  | Yojson.Json_error msg -> Error ("invalid json: " ^ msg)
  | Yojson.Safe.Util.Type_error (msg, _) ->
      Error ("invalid request shape: " ^ msg)

let encode_dot (dot : dot) =
  `Assoc
    [
      ("clientId", `String dot.client_id);
      ("version", `Intlit (Int64.to_string dot.version));
    ]

let encode_operation operation =
  let base_fields =
    [
      ("type", `String (operation_type operation.payload));
      ("tableName", `String operation.table_name);
      ("rowKey", `String operation.row_key);
      ("dot", encode_dot operation.dot);
    ]
  in
  match operation.payload with
  | Set_row { fields } -> `Assoc (base_fields @ [ ("fields", fields) ])
  | Remove_row { version_vector } ->
      let version_vector_json =
        `Assoc
          (List.map
             (fun (client_id, version) ->
               (client_id, `Intlit (Int64.to_string version)))
             version_vector)
      in
      `Assoc (base_fields @ [ ("versionVector", version_vector_json) ])

let encode_sync_response response =
  let json =
    `Assoc
      [
        ( "baseServerVersion",
          `Intlit (Int64.to_string response.base_server_version) );
        ( "latestServerVersion",
          `Intlit (Int64.to_string response.latest_server_version) );
        ("operations", `List (List.map encode_operation response.operations));
        ( "syncedOperations",
          `List (List.map encode_dot response.synced_operations) );
        ("responseHash", `String response.response_hash);
      ]
  in
  Yojson.Safe.to_string json
