open Shared

let deep_scan_interval_steps = 100

let list_server_versions_query =
  let open Caqti_request.Infix in
  (Caqti_type.string ->* Caqti_type.int64)
    "SELECT server_version FROM crdt_operations WHERE db_name = ? ORDER BY server_version ASC"

let fail_property ~step_n fmt =
  Printf.ksprintf
    (fun msg -> failwith (Printf.sprintf "PROPERTY_FAIL: step=%d %s" step_n msg))
    fmt

let read_count_and_max ~(world : world) =
  let count =
    match
      Sync.Repository.count_operations world.db_conn ~db_name:world.tenant_key
    with
    | Ok count -> count
    | Error err ->
        fail_property ~step_n:world.step_n "count_operations error=%s"
          (Sync.Repository.error_to_string err)
  in
  let max_server_version =
    match
      Sync.Repository.get_max_server_version world.db_conn
        ~db_name:world.tenant_key
    with
    | Ok max_server_version -> max_server_version
    | Error err ->
        fail_property ~step_n:world.step_n "get_max_server_version error=%s"
          (Sync.Repository.error_to_string err)
  in
  (count, max_server_version)

let validate_count_max_consistency ~(world : world) ~count ~max_server_version =
  if count = 0 && max_server_version <> -1L then
    fail_property ~step_n:world.step_n
      "empty db must have max_server_version=-1 got=%Ld" max_server_version;

  if count > 0 && max_server_version < 0L then
    fail_property ~step_n:world.step_n
      "non-empty db must have max_server_version>=0 got=%Ld count=%d"
      max_server_version count

let validate_monotonicity ~(world : world) ~count ~max_server_version =
  (match world.last_count_operations with
  | Some prev when count < prev ->
      fail_property ~step_n:world.step_n
        "count_operations regressed prev=%d now=%d" prev count
  | _ -> ());

  (match world.last_max_server_version with
  | Some prev when Int64.compare max_server_version prev < 0 ->
      fail_property ~step_n:world.step_n
        "max_server_version regressed prev=%Ld now=%Ld" prev max_server_version
  | _ -> ())

let should_run_deep_scan ~(world : world) =
  world.step_n = 1 || world.step_n mod deep_scan_interval_steps = 0

let read_server_versions ~(world : world) =
  let module Db = (val world.db_conn : Caqti_eio.CONNECTION) in
  match Db.collect_list list_server_versions_query world.tenant_key with
  | Ok versions -> versions
  | Error err ->
      fail_property ~step_n:world.step_n "list_server_versions error=%s"
        (Caqti_error.show err)

let validate_server_version_sequence ~(world : world) ~count ~max_server_version =
  let versions = read_server_versions ~world in
  let version_count = List.length versions in
  if version_count <> count then
    fail_property ~step_n:world.step_n
      "row count mismatch count_operations=%d scan_count=%d" count version_count;

  let rec check_contiguous = function
    | [] | [ _ ] -> ()
    | a :: ((b :: _) as rest) ->
        if Int64.compare b (Int64.add a 1L) <> 0 then
          fail_property ~step_n:world.step_n
            "server_version sequence not contiguous prev=%Ld next=%Ld" a b;
        check_contiguous rest
  in
  check_contiguous versions;

  match List.rev versions with
  | [] -> ()
  | last :: _ when Int64.compare last max_server_version <> 0 ->
      fail_property ~step_n:world.step_n
        "max_server_version mismatch scanned_last=%Ld reported_max=%Ld" last
        max_server_version
  | _ -> ()

let check_properties (world : world) =
  let count, max_server_version = read_count_and_max ~world in

  validate_count_max_consistency ~world ~count ~max_server_version;
  validate_monotonicity ~world ~count ~max_server_version;

  if should_run_deep_scan ~world then
    validate_server_version_sequence ~world ~count ~max_server_version;

  world.last_count_operations <- Some count;
  world.last_max_server_version <- Some max_server_version
