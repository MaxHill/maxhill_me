type operation = Sync.Repository.db_crdt_operation

let versions_strictly_increasing versions =
  let rec check = function
    | [] | [ _ ] -> true
    | previous :: ((next :: _) as rest) ->
        Int64.compare next previous > 0 && check rest
  in
  check versions

let same_dot (left : operation) (right : operation) =
  left.Sync.Repository.tenant_id = right.tenant_id
  && left.db_name = right.db_name
  && left.table_name = right.table_name
  && left.row_key = right.row_key
  && left.client_id = right.client_id
  && left.version = right.version

let row_with_dot rows expected = List.find_opt (same_dot expected) rows

let checkpoint_has_cutoff (row : operation) cutoff =
  row.op_type = "checkpointRow"
  && match row.json_value with
     | None -> false
     | Some json ->
         (try
            let decoded = Yojson.Safe.from_string json in
            let actual =
              decoded |> Yojson.Safe.Util.member "checkpointSeenServerVersion"
              |> Sync.Sync_engine.int64_of_json
            in
            actual = cutoff
          with _ -> false)

let validate_prefix_replacement ~cutoff ~before_rows ~after_rows
    ~checkpoint_client_id ~checkpoint_version =
  let removed_prefix =
    List.filter
      (fun (row : operation) -> Int64.compare row.server_version cutoff < 0)
      before_rows
  in
  let retained_tail =
    List.filter
      (fun (row : operation) -> Int64.compare row.server_version cutoff >= 0)
      before_rows
  in
  let stale_prefix =
    List.find_opt (fun row -> row_with_dot after_rows row <> None) removed_prefix
  in
  let missing_tail = List.find_opt (fun row -> not (List.mem row after_rows)) retained_tail in
  let checkpoint =
    List.find_opt
      (fun (row : operation) ->
        row.client_id = checkpoint_client_id && row.version = checkpoint_version)
      after_rows
  in
  match (stale_prefix, missing_tail, checkpoint) with
  | Some row, _, _ ->
      Error
        (Printf.sprintf "covered original dot remains: %s#%Ld serverVersion=%Ld"
           row.client_id row.version row.server_version)
  | _, Some row, _ ->
      Error
        (Printf.sprintf "uncovered tail operation was changed or removed: %s#%Ld serverVersion=%Ld"
           row.client_id row.version row.server_version)
  | _, _, None -> Error "published checkpoint dot is missing after compaction"
  | _, _, Some row when not (checkpoint_has_cutoff row cutoff) ->
      Error "published checkpoint has the wrong exclusive cutoff"
  | _, _, Some row when Int64.compare row.server_version cutoff < 0 ->
      Error "checkpoint publication version is below its coverage boundary"
  | _ -> Ok ()
