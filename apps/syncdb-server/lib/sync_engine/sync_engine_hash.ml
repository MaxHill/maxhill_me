open Sync_engine_core

let is_finite_number value =
  match classify_float value with FP_nan | FP_infinite -> false | _ -> true

let canonical_number_hex value =
  let normalized = if value = 0. then 0. else value in
  let bits = Int64.bits_of_float normalized in
  Printf.sprintf "%016Lx" bits

let number_of_json = function
  | `Int value -> Ok (float_of_int value)
  | `Intlit value -> (
      try Ok (float_of_string value) with Failure _ -> Error ("invalid numeric value: " ^ value))
  | `Float value -> Ok value
  | _ -> Error "expected JSON number"

let reject_duplicate_keys fields =
  let seen = Hashtbl.create (List.length fields) in
  let rec loop = function
    | [] -> Ok ()
    | (key, _) :: rest ->
        if Hashtbl.mem seen key then Error ("duplicate object key: " ^ key)
        else (
          Hashtbl.add seen key true;
          loop rest)
  in
  loop fields

let rec encode_typed_json (value : Yojson.Safe.t) : (Yojson.Safe.t, string) result =
  let ( let* ) = Result.bind in
  match value with
  | `Null -> Ok (`List [ `String "null" ])
  | `Bool v -> Ok (`List [ `String "bool"; `Bool v ])
  | `String v -> Ok (`List [ `String "string"; `String v ])
  | (`Int _ | `Intlit _ | `Float _) as json_number ->
      let* number = number_of_json json_number in
      if not (is_finite_number number) then Error "non-finite JSON number"
      else
        Ok
          (`List [ `String "number"; `String (canonical_number_hex number) ])
  | `List values ->
      let rec encode_all acc = function
        | [] -> Ok (List.rev acc)
        | item :: rest ->
            let* encoded = encode_typed_json item in
            encode_all (encoded :: acc) rest
      in
      let* encoded_values = encode_all [] values in
      Ok (`List [ `String "array"; `List encoded_values ])
  | `Assoc fields ->
      let* () = reject_duplicate_keys fields in
      let sorted_fields = List.sort (fun (a, _) (b, _) -> String.compare a b) fields in
      let rec encode_all acc = function
        | [] -> Ok (List.rev acc)
        | (key, json_value) :: rest ->
            let* encoded_value = encode_typed_json json_value in
            let pair = `List [ `String key; encoded_value ] in
            encode_all (pair :: acc) rest
      in
      let* encoded_pairs = encode_all [] sorted_fields in
      Ok (`List [ `String "object"; `List encoded_pairs ])

let to_typed_string value =
  let ( let* ) = Result.bind in
  let* encoded = encode_typed_json value in
  Ok (Yojson.Safe.to_string encoded)

let rec validate_strict_json (value : Yojson.Safe.t) : (unit, string) result =
  let ( let* ) = Result.bind in
  match value with
  | `Null | `Bool _ | `String _ -> Ok ()
  | (`Int _ | `Intlit _ | `Float _) as json_number ->
      let* number = number_of_json json_number in
      if is_finite_number number then Ok () else Error "non-finite JSON number"
  | `List items ->
      List.fold_left
        (fun acc item ->
          let* () = acc in
          validate_strict_json item)
        (Ok ()) items
  | `Assoc fields ->
      let* () = reject_duplicate_keys fields in
      List.fold_left
        (fun acc (_, json_value) ->
          let* () = acc in
          validate_strict_json json_value)
        (Ok ()) fields

let ( let* ) = Result.bind

let hash_parts parts =
  let joined = String.concat "|" parts in
  Digestif.SHA256.digest_string joined |> Digestif.SHA256.to_hex

let canonical_json_part value = to_typed_string value

let canonical_vector_part version_vector =
  let vector_json =
    `Assoc
      (List.map
         (fun (client_id, version) ->
           (client_id, `Intlit (Int64.to_string version)))
         version_vector)
  in
  canonical_json_part vector_json

let hash_sync_request_result (request : sync_request) =
  let parts_rev = ref [] in
  let push value = parts_rev := value :: !parts_rev in

  let push_operation operation =
    let* op_type, value, value_key =
      match operation.payload with
      | Set_row { fields } ->
          let* canonical_fields = canonical_json_part fields in
          Ok ("setRow", canonical_fields, "null")
      | Remove_row { version_vector } ->
          let* canonical_vector = canonical_vector_part version_vector in
          Ok ("removeRow", canonical_vector, "null")
      | Checkpoint_row { checkpoint_seen_server_version; state } ->
          let* canonical_state = canonical_json_part state in
          Ok ("checkpointRow", canonical_state, Int64.to_string checkpoint_seen_server_version)
    in

    push operation.row_key;
    push operation.table_name;
    push op_type;
    push value;
    push value_key;
    push (Int64.to_string operation.dot.version);
    push operation.dot.client_id;
    Ok ()
  in
  push "3";
  push request.client_id;
  push request.db_name;
  push (Int64.to_string request.client_last_mutation_id);
  push (Int64.to_string request.last_seen_server_version);
  let* () =
    List.fold_left
      (fun acc (mutation : mutation) ->
        let* () = acc in
        push (Int64.to_string mutation.id);
        push_operation mutation.operation)
      (Ok ()) request.mutations
  in
  Ok (hash_parts (List.rev !parts_rev))

let hash_sync_request (request : sync_request) =
  match hash_sync_request_result request with
  | Ok hash -> hash
  | Error message -> invalid_arg message

let hash_sync_response_result (response : sync_response) =
  let parts_rev = ref [] in
  let push value = parts_rev := value :: !parts_rev in
  push "3";
  push response.client_id;
  push (Int64.to_string response.base_server_version);
  push (Int64.to_string response.latest_server_version);
  push (Int64.to_string response.last_mutation_id);
  let push_operation operation =
    push (operation_type operation.payload);
    push operation.table_name;
    push operation.row_key;
    push operation.dot.client_id;
    push (Int64.to_string operation.dot.version);
    match operation.payload with
    | Set_row { fields } ->
        let* canonical_fields = canonical_json_part fields in
        push "null";
        push canonical_fields;
        Ok ()
    | Checkpoint_row { checkpoint_seen_server_version; state } ->
        let* canonical_state = canonical_json_part state in
        push "null";
        push canonical_state;
        push (Int64.to_string checkpoint_seen_server_version);
        Ok ()
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
          sorted_version_vector;
        Ok ()
  in
  let* () =
    List.fold_left2
      (fun acc operation server_version ->
        let* () = acc in
        let* () = push_operation operation in
        push (Int64.to_string server_version);
        Ok ())
      (Ok ()) response.operations response.operation_server_versions
  in
  Ok (hash_parts (List.rev !parts_rev))

let hash_sync_response (response : sync_response) =
  match hash_sync_response_result response with
  | Ok hash -> hash
  | Error message -> invalid_arg message
