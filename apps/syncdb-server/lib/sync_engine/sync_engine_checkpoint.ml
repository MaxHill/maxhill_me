open Sync_engine_core

module Clients = Map.Make (String)

type candidate = { dot : dot; value : Yojson.Safe.t }
type tombstone = { dot : dot; vector : int64 Clients.t }

let dot_json (dot : dot) =
  `Assoc [ ("clientId", `String dot.client_id); ("version", `Intlit (Int64.to_string dot.version)) ]

let compare_dot a b =
  let by_version = Int64.compare a.version b.version in
  if by_version <> 0 then by_version else String.compare a.client_id b.client_id

let dot_of_json json =
  { client_id = json |> Yojson.Safe.Util.member "clientId" |> Yojson.Safe.Util.to_string;
    version = json |> Yojson.Safe.Util.member "version" |> int64_of_json }

let merge_vector vector entries =
  List.fold_left (fun vector (client_id, version) ->
    let previous = Clients.find_opt client_id vector |> Option.value ~default:(-1L) in
    if version > previous then Clients.add client_id version vector else vector)
    vector entries

let vector_of_json = function
  | `Assoc entries ->
      merge_vector Clients.empty (List.map (fun (client, value) -> client, int64_of_json value) entries)
  | _ -> Clients.empty

let vector_json vector =
  `Assoc (List.map (fun (client, version) -> client, `Intlit (Int64.to_string version))
    (Clients.bindings vector))

let fields_of_state json =
  match Yojson.Safe.Util.member "fields" json with
  | `Assoc entries -> entries
  | _ -> []

let tombstone_of_state json =
  match Yojson.Safe.Util.member "tombstone" json with
  | `Assoc _ as tombstone ->
      Some { dot = dot_of_json (Yojson.Safe.Util.member "dot" tombstone);
             vector = vector_of_json (Yojson.Safe.Util.member "versionVector" tombstone) }
  | _ -> None

let contenders field =
  let extra = match Yojson.Safe.Util.member "contenders" field with
    | `List entries -> entries
    | _ -> []
  in
  field :: extra

let add_candidate (candidates : candidate Clients.t) (candidate : candidate) =
  match Clients.find_opt candidate.dot.client_id candidates with
  | Some previous when compare_dot candidate.dot previous.dot <= 0 -> candidates
  | _ -> Clients.add candidate.dot.client_id candidate candidates

let merge_field fields (name, incoming) =
  let existing = Clients.find_opt name fields |> Option.value ~default:Clients.empty in
  let candidates = List.fold_left (fun candidates json ->
    add_candidate candidates
      { dot = dot_of_json (Yojson.Safe.Util.member "dot" json);
        value = Yojson.Safe.Util.member "value" json }) existing (contenders incoming) in
  Clients.add name candidates fields

let merge_tombstone current incoming =
  match current with
  | None -> Some incoming
  | Some existing ->
      let dot = if compare_dot incoming.dot existing.dot > 0 then incoming.dot else existing.dot in
      let vector = Clients.union (fun _ a b -> Some (Int64.max a b)) existing.vector incoming.vector in
      Some { dot; vector }

let dominated tombstone (dot : dot) =
  match tombstone with
  | None -> false
  | Some current ->
      match Clients.find_opt dot.client_id current.vector with
      | Some version -> dot.version <= version
      | None -> false

let apply_operation (fields, tombstone) operation =
  match operation.payload with
  | Set_row { fields = values } ->
      if dominated tombstone operation.dot then (fields, tombstone)
      else
        let entries = match values with `Assoc entries -> entries | _ -> [] in
        let fields = List.fold_left (fun fields (name, value) ->
          let existing = Clients.find_opt name fields |> Option.value ~default:Clients.empty in
          Clients.add name (add_candidate existing { dot = operation.dot; value }) fields)
          fields entries in
        (fields, tombstone)
  | Remove_row { version_vector } ->
      let incoming = { dot = operation.dot; vector = merge_vector Clients.empty version_vector } in
      (fields, merge_tombstone tombstone incoming)
  | Checkpoint_row { state; _ } ->
      let fields = List.fold_left merge_field fields (fields_of_state state) in
      (fields, Option.fold ~none:tombstone ~some:(merge_tombstone tombstone) (tombstone_of_state state))

let candidate_json (candidate : candidate) =
  `Assoc [ ("value", candidate.value); ("dot", dot_json candidate.dot) ]

let encode_contenders tombstone candidates =
  let retained = Clients.fold (fun _ (candidate : candidate) entries ->
    if dominated tombstone candidate.dot then entries else candidate :: entries) candidates [] in
  let sorted = List.sort (fun (a : candidate) (b : candidate) -> compare_dot b.dot a.dot) retained in
  match sorted with
  | [] -> None
  | winner :: rest ->
      let base = [ ("value", winner.value); ("dot", dot_json winner.dot) ] in
      Some (`Assoc (base @ if rest = [] then [] else [ ("contenders", `List (List.map candidate_json rest)) ]))

let fold operations =
  (* Keep client maps across operations: only the final output is sorted and encoded. *)
  let fields, tombstone = List.fold_left apply_operation (Clients.empty, None) operations in
  let fields = Clients.bindings fields |> List.filter_map (fun (name, candidates) ->
    Option.map (fun field -> name, field) (encode_contenders tombstone candidates)) in
  `Assoc
    ([ ("fields", `Assoc fields) ]
    @ (match tombstone with None -> [] | Some current ->
        [ ("tombstone", `Assoc [ ("dot", dot_json current.dot);
                                ("versionVector", vector_json current.vector) ]) ]))
