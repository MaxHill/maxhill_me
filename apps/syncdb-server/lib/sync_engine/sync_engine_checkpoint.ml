open Sync_engine_core

let dot_json (dot : dot) =
  `Assoc [ ("clientId", `String dot.client_id); ("version", `Intlit (Int64.to_string dot.version)) ]

let compare_dot a b =
  let by_version = Int64.compare a.version b.version in
  if by_version <> 0 then by_version else String.compare a.client_id b.client_id

let dot_of_json json =
  { client_id = json |> Yojson.Safe.Util.member "clientId" |> Yojson.Safe.Util.to_string;
    version = json |> Yojson.Safe.Util.member "version" |> int64_of_json }

let version_vector_of_json = function
  | `Assoc entries ->
      List.map (fun (client_id, value) -> (client_id, int64_of_json value)) entries
  | _ -> []

let max_vectors a b =
  List.fold_left
    (fun acc (client_id, version) ->
      let previous = List.assoc_opt client_id acc |> Option.value ~default:(-1L) in
      if version > previous then
        (client_id, version) :: List.remove_assoc client_id acc
      else acc)
    a b

let vector_json vector =
  `Assoc (List.map (fun (client_id, version) -> (client_id, `Intlit (Int64.to_string version))) vector)

let fields_of_state json =
  match Yojson.Safe.Util.member "fields" json with
  | `Assoc entries -> entries
  | _ -> []

let tombstone_of_state json =
  match Yojson.Safe.Util.member "tombstone" json with
  | `Assoc _ as tombstone -> Some tombstone
  | _ -> None

let merge_field fields (name, incoming) =
  let incoming_dot = incoming |> Yojson.Safe.Util.member "dot" |> dot_of_json in
  match List.assoc_opt name fields with
  | None -> (name, incoming) :: fields
  | Some existing ->
      let existing_dot = existing |> Yojson.Safe.Util.member "dot" |> dot_of_json in
      if compare_dot incoming_dot existing_dot > 0 then
        (name, incoming) :: List.remove_assoc name fields
      else fields

let merge_tombstone current incoming =
  match current with
  | None -> Some incoming
  | Some existing ->
      let existing_dot = existing |> Yojson.Safe.Util.member "dot" |> dot_of_json in
      let incoming_dot = incoming |> Yojson.Safe.Util.member "dot" |> dot_of_json in
      let dot = if compare_dot incoming_dot existing_dot > 0 then incoming_dot else existing_dot in
      let vector =
        max_vectors
          (existing |> Yojson.Safe.Util.member "versionVector" |> version_vector_of_json)
          (incoming |> Yojson.Safe.Util.member "versionVector" |> version_vector_of_json)
      in
      Some (`Assoc [ ("dot", dot_json dot); ("versionVector", vector_json vector) ])

let apply_operation (fields, tombstone) operation =
  match operation.payload with
  | Set_row { fields = values } ->
      let dominated =
        match tombstone with
        | None -> false
        | Some current ->
            let vector = current |> Yojson.Safe.Util.member "versionVector" |> version_vector_of_json in
            (match List.assoc_opt operation.dot.client_id vector with
            | Some version -> operation.dot.version <= version
            | None -> false)
      in
      if dominated then (fields, tombstone)
      else
        let entries = match values with `Assoc entries -> entries | _ -> [] in
        let fields =
          List.fold_left
            (fun state (name, value) ->
              let encoded = `Assoc [ ("value", value); ("dot", dot_json operation.dot) ] in
              merge_field state (name, encoded))
            fields entries
        in
        (fields, tombstone)
  | Remove_row { version_vector } ->
      let incoming =
        `Assoc [ ("dot", dot_json operation.dot); ("versionVector", vector_json version_vector) ]
      in
      (fields, merge_tombstone tombstone incoming)
  | Checkpoint_row { state; _ } ->
      let fields = List.fold_left merge_field fields (fields_of_state state) in
      (fields, Option.fold ~none:tombstone ~some:(merge_tombstone tombstone) (tombstone_of_state state))

let fold operations =
  let fields, tombstone = List.fold_left apply_operation ([], None) operations in
  let fields =
    List.filter
      (fun (_, field) ->
        match tombstone with
        | None -> true
        | Some tombstone ->
            let dot = field |> Yojson.Safe.Util.member "dot" |> dot_of_json in
            let vector = tombstone |> Yojson.Safe.Util.member "versionVector" |> version_vector_of_json in
            match List.assoc_opt dot.client_id vector with
            | None -> true
            | Some version -> dot.version > version)
      fields
  in
  `Assoc
    ([ ("fields", `Assoc fields) ]
    @ (match tombstone with None -> [] | Some tombstone -> [ ("tombstone", tombstone) ]))


(* Coverage deliberately accepts no publication/cursor versions. *)
type coverage = Covered | Not_covered | Conflict of string | Invalid_checkpoint

let integer_value = function
  | `Int value -> Some (Int64.of_int value)
  | `Intlit value -> Int64.of_string_opt value
  | _ -> None

let integer_matches_float integer value =
  let text = match integer with
    | `Int number -> string_of_int number
    | `Intlit number -> number
    | _ -> ""
  in
  Float.is_finite value && Float.is_integer value
  (* Avoid rounding a large integer to a float before comparing. *)
  && if value = 0. then text = "0" || text = "-0"
     else text = Printf.sprintf "%.0f" value

let rec json_values_equal left right =
  match left, right with
  | `Null, `Null -> true
  | `Bool a, `Bool b -> a = b
  | `String a, `String b -> a = b
  | `Float a, `Float b -> Float.is_finite a && Float.is_finite b && a = b
  | ((`Int _ | `Intlit _) as integer), `Float value
  | `Float value, ((`Int _ | `Intlit _) as integer) ->
      integer_matches_float integer value
  | ((`Int _ | `Intlit _) as a), ((`Int _ | `Intlit _) as b) ->
      (match integer_value a, integer_value b with
      | Some a, Some b -> a = b
      | _ -> a = b)
  | `List a, `List b ->
      List.length a = List.length b && List.for_all2 json_values_equal a b
  | `Assoc a, `Assoc b ->
      let unique fields =
        let keys = List.map fst fields in
        List.length keys = List.length (List.sort_uniq String.compare keys)
      in
      unique a && unique b && List.length a = List.length b
      && List.for_all (fun (key, value) ->
          match List.assoc_opt key b with
          | None -> false
          | Some other -> json_values_equal value other) a
  | _ -> false

let checked_fields state =
  let open Yojson.Safe.Util in
  state |> member "fields" |> to_assoc
  |> List.map (fun (name, field) ->
      let properties = to_assoc field in
      let value = List.assoc "value" properties in
      let dot = List.assoc "dot" properties |> dot_of_json in
      name, (value, dot))

let checked_vector json =
  json |> Yojson.Safe.Util.to_assoc
  |> List.map (fun (client_id, version) -> client_id, int64_of_json version)

let checked_tombstone state =
  match List.assoc_opt "tombstone" (Yojson.Safe.Util.to_assoc state) with
  | None -> None
  | Some tombstone ->
      let open Yojson.Safe.Util in
      Some (tombstone |> member "dot" |> dot_of_json,
            tombstone |> member "versionVector" |> checked_vector)

let vector_covers_dot vector (dot : dot) =
  match List.assoc_opt dot.client_id vector with
  | Some version -> version >= dot.version
  | None -> false

let classify_fields fields dot values =
  let covered = ref true in
  let conflict = ref None in
  List.iter (fun (name, value) ->
      match List.assoc_opt name fields with
      | None -> covered := false
      | Some (existing_value, existing_dot) ->
          let order = compare_dot existing_dot dot in
          if order < 0 then covered := false
          else if order = 0 && not (json_values_equal value existing_value) then
            conflict := Some name) values;
  match !conflict with
  | Some field -> Conflict field
  | None -> if !covered then Covered else Not_covered

let classify_coverage state operation =
  try
    let fields = checked_fields state in
    let tombstone = checked_tombstone state in
    match operation.payload with
    | Set_row { fields = values } ->
        let values = Yojson.Safe.Util.to_assoc values in
        (match tombstone with
        | Some (_, vector) when vector_covers_dot vector operation.dot -> Covered
        | _ -> classify_fields fields operation.dot values)
    | Remove_row { version_vector } ->
        (match tombstone with
        | Some (dot, vector) when compare_dot dot operation.dot >= 0
            && List.for_all (fun (client_id, version) ->
                vector_covers_dot vector { client_id; version }) version_vector -> Covered
        | _ -> Not_covered)
    | Checkpoint_row _ -> Not_covered
  with
  | Yojson.Safe.Util.Type_error _ | Not_found | Failure _ | Invalid_argument _ ->
      Invalid_checkpoint
