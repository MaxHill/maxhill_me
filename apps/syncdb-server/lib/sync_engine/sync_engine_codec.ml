open Sync_engine_core

let ( let* ) = Result.bind

let max_safe_integer = 9_007_199_254_740_991L

let parse_int64_field ~name json =
  try Ok (int64_of_json json) with
  | Failure _ | Invalid_argument _ ->
      Error (Printf.sprintf "invalid numeric value for %s" name)
  | Yojson.Safe.Util.Type_error _ ->
      Error (Printf.sprintf "invalid request shape: expected int64 for %s" name)

let parse_safe_integer ~name ~minimum json =
  let invalid () = Error (Printf.sprintf "%s must be a numeric safe integer" name) in
  let parsed = match json with
    | `Int value -> Some (Int64.of_int value)
    | `Intlit value -> Int64.of_string_opt value
    | `Float value when Float.is_finite value && Float.is_integer value
        && value >= Int64.to_float minimum && value <= Int64.to_float max_safe_integer ->
        Some (Int64.of_float value)
    | _ -> None
  in
  match parsed with
  | Some value when value >= minimum && value <= max_safe_integer -> Ok value
  | _ -> invalid ()

let ensure_safe_nonnegative ~name value =
  if value < 0L then Error (Printf.sprintf "%s must be >= 0" name)
  else if value > max_safe_integer then
    Error (Printf.sprintf "%s must be <= %Ld" name max_safe_integer)
  else Ok ()

let decode_dot json =
  let open Yojson.Safe.Util in
  let client_id = json |> member "clientId" |> to_string in
  let* version = parse_safe_integer ~name:"dot.version" ~minimum:0L (json |> member "version") in
  let* () = ensure_safe_nonnegative ~name:"dot.version" version in
  Ok { client_id; version }

let decode_operation json =
  let open Yojson.Safe.Util in
  let operation_type = json |> member "type" |> to_string in
  let table_name = json |> member "tableName" |> to_string in
  let row_key = json |> member "rowKey" |> to_string in
  let* dot = json |> member "dot" |> decode_dot in
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
        let* () =
          Sync_engine_hash.validate_strict_json fields
          |> Result.map_error (fun msg -> "invalid setRow fields: " ^ msg)
        in
        Ok { table_name; row_key; dot; payload = Set_row { fields } }
  | "removeRow" ->
      if
        (not (has_key "versionVector" json))
        || has_key "fieldKey" json || has_key "jsonValue" json
        || has_key "fields" json || has_key "table" json || has_key "field" json
        || has_key "value" json || has_key "context" json
      then Error "removeRow payload shape mismatch"
      else
        let version_vector_json = json |> member "versionVector" in
        let* () =
          Sync_engine_hash.validate_strict_json version_vector_json
          |> Result.map_error (fun msg -> "invalid removeRow versionVector: " ^ msg)
        in
        let version_vector_assoc = version_vector_json |> to_assoc in
        let rec decode_vector acc = function
          | [] -> Ok (List.rev acc)
          | (client_id, version_json) :: rest ->
              let* version = parse_safe_integer ~name:("versionVector." ^ client_id) ~minimum:0L version_json in
              let* () = ensure_safe_nonnegative ~name:("versionVector." ^ client_id) version in
              decode_vector ((client_id, version) :: acc) rest
        in
        let* version_vector = decode_vector [] version_vector_assoc in
        Ok { table_name; row_key; dot; payload = Remove_row { version_vector } }
  | "checkpointRow" ->
      if
        not (has_key "checkpointSeenServerVersion" json && has_key "fields" json)
        || has_key "state" json || has_key "versionVector" json
      then Error "checkpointRow payload shape mismatch"
      else
        let fields = json |> member "fields" in
        let tombstone = json |> member "tombstone" in
        (match fields with
        | `Assoc _ ->
            (match (has_key "tombstone" json, tombstone) with
            | true, `Assoc _ | false, _ ->
                let* checkpoint_seen_server_version =
                  parse_int64_field ~name:"checkpointSeenServerVersion"
                    (json |> member "checkpointSeenServerVersion")
                in
                let state =
                  `Assoc
                    ([ ("fields", fields) ]
                    @ if has_key "tombstone" json then [ ("tombstone", tombstone) ] else [])
                in
                let* () =
                  Sync_engine_hash.validate_strict_json state
                  |> Result.map_error (fun msg -> "invalid checkpointRow state: " ^ msg)
                in
                Ok
                  { table_name; row_key; dot;
                    payload = Checkpoint_row { checkpoint_seen_server_version; state } }
            | _ -> Error "checkpointRow tombstone shape mismatch")
        | _ -> Error "checkpointRow fields must be an object")
  | _ -> Error ("unsupported operation type: " ^ operation_type)

let decode_mutation ~request_client_id json =
  let open Yojson.Safe.Util in
  let* id = parse_safe_integer ~name:"mutation.id" ~minimum:1L (json |> member "id") in
  let* () =
    if id <= 0L then Error "mutation.id must be > 0"
    else if id > max_safe_integer then
      Error (Printf.sprintf "mutation.id must be <= %Ld" max_safe_integer)
    else Ok ()
  in
  let* operation = json |> member "operation" |> decode_operation in
  if operation.dot.client_id <> request_client_id then
    Error "mutation dot.clientId must equal request clientId"
  else
    match operation.payload with
    | Checkpoint_row _ -> Error "clients cannot upload checkpointRow"
    | _ -> Ok { id; operation }

let decode_sync_request raw =
  let open Yojson.Safe.Util in
  try
    let json = Yojson.Safe.from_string raw in
    let protocol_version = json |> member "protocolVersion" |> to_int in
    if protocol_version <> 3 then Error "unsupported protocolVersion"
    else
    let client_id = json |> member "clientId" |> to_string in
    if client_id = "" then Error "clientId must be non-empty"
    else
    let db_name = json |> member "dbName" |> to_string in
    let* client_last_mutation_id =
      parse_safe_integer ~name:"clientLastMutationID" ~minimum:0L (json |> member "clientLastMutationID")
    in
    let* () = ensure_safe_nonnegative ~name:"clientLastMutationID" client_last_mutation_id in
    let mutations_json = json |> member "mutations" |> to_list in
    let rec decode_all acc = function
      | [] -> Ok (List.rev acc)
      | mutation_json :: rest -> (
          match decode_mutation ~request_client_id:client_id mutation_json with
          | Error msg -> Error msg
          | Ok mutation -> decode_all (mutation :: acc) rest)
    in
    match decode_all [] mutations_json with
    | Error msg -> Error msg
    | Ok mutations ->
        let* last_seen_server_version =
          parse_safe_integer ~name:"lastSeenServerVersion" ~minimum:(-1L) (json |> member "lastSeenServerVersion")
        in
        let request_hash = json |> member "requestHash" |> to_string in
        let* db_name = Db_name.validate db_name in
        Ok { protocol_version; client_id; db_name; client_last_mutation_id; mutations;
             last_seen_server_version; request_hash }
  with
  | Yojson.Json_error msg -> Error ("invalid json: " ^ msg)
  | Yojson.Safe.Util.Type_error (msg, _) ->
      Error ("invalid request shape: " ^ msg)
  | Failure _ | Invalid_argument _ -> Error "invalid numeric value"

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
  | Checkpoint_row { checkpoint_seen_server_version; state } ->
      let fields = Yojson.Safe.Util.member "fields" state in
      let tombstone = Yojson.Safe.Util.member "tombstone" state in
      `Assoc
        (base_fields
        @ [ ("checkpointSeenServerVersion", `Intlit (Int64.to_string checkpoint_seen_server_version));
            ("fields", fields) ]
        @ if tombstone = `Null then [] else [ ("tombstone", tombstone) ])
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
      [ ("protocolVersion", `Int response.protocol_version);
        ("clientId", `String response.client_id);
        ( "baseServerVersion",
          `Intlit (Int64.to_string response.base_server_version) );
        ( "latestServerVersion",
          `Intlit (Int64.to_string response.latest_server_version) );
        ("lastMutationID", `Intlit (Int64.to_string response.last_mutation_id));
        ( "operations",
          `List
            (List.map2
               (fun operation server_version ->
                 match encode_operation operation with
                 | `Assoc fields ->
                     `Assoc (fields @ [ ("serverVersion", `Intlit (Int64.to_string server_version)) ])
                 | _ -> assert false)
               response.operations response.operation_server_versions) );
        ("responseHash", `String response.response_hash) ]
  in
  Yojson.Safe.to_string json
