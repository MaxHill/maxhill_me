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
