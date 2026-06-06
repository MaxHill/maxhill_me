open Sync_engine_core

let decode_dot json =
  let open Yojson.Safe.Util in
  let client_id = json |> member "clientId" |> to_string in
  let version = json |> member "version" |> int64_of_json in
  { client_id; version }

let decode_operation json =
  let open Yojson.Safe.Util in
  let operation_type = json |> member "type" |> to_string in
  let table = json |> member "table" |> to_string in
  let row_key = json |> member "rowKey" |> to_string in
  let dot = json |> member "dot" |> decode_dot in
  match operation_type with
  | "set" ->
      if
        (not (has_key "field" json))
        || (not (has_key "value" json))
        || has_key "context" json
      then Error "set payload shape mismatch"
      else
        let field = json |> member "field" |> to_string in
        let value = json |> member "value" in
        Ok { table; row_key; dot; payload = Set { field; value } }
  | "setRow" ->
      if
        (not (has_key "value" json))
        || has_key "field" json || has_key "context" json
      then Error "setRow payload shape mismatch"
      else
        let value = json |> member "value" in
        Ok { table; row_key; dot; payload = Set_row { value } }
  | "remove" ->
      if
        (not (has_key "context" json))
        || has_key "field" json || has_key "value" json
      then Error "remove payload shape mismatch"
      else
        let context_json = json |> member "context" |> to_assoc in
        let context =
          List.map
            (fun (client_id, version_json) ->
              (client_id, int64_of_json version_json))
            context_json
        in
        Ok { table; row_key; dot; payload = Remove { context } }
  | _ -> Error ("unsupported operation type: " ^ operation_type)

let decode_sync_request raw =
  let open Yojson.Safe.Util in
  try
    let json = Yojson.Safe.from_string raw in
    let client_id = json |> member "clientId" |> to_string in
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
        Ok { client_id; operations; last_seen_server_version; request_hash }
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
      ("table", `String operation.table);
      ("rowKey", `String operation.row_key);
      ("dot", encode_dot operation.dot);
    ]
  in
  match operation.payload with
  | Set { field; value } ->
      `Assoc (base_fields @ [ ("field", `String field); ("value", value) ])
  | Set_row { value } -> `Assoc (base_fields @ [ ("value", value) ])
  | Remove { context } ->
      let context_json =
        `Assoc
          (List.map
             (fun (client_id, version) ->
               (client_id, `Intlit (Int64.to_string version)))
             context)
      in
      `Assoc (base_fields @ [ ("context", context_json) ])

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
