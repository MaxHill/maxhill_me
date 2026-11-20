open Checkpoint_under_test
open Sync_engine_core

let write client version value : crdt_operation =
  { table_name = "todos"; row_key = "r1";
    dot = { client_id = client; version };
    payload = Set_row { fields = `Assoc [ "title", `Int value; "other", `Int value ] } }

let checkpoint state : crdt_operation =
  { table_name = "todos"; row_key = "r1";
    dot = { client_id = "checkpoint"; version = 1L };
    payload = Checkpoint_row { checkpoint_seen_server_version = 1L; state } }

let entries state =
  let field = state |> Yojson.Safe.Util.member "fields" |> Yojson.Safe.Util.member "title" in
  let rest = match Yojson.Safe.Util.member "contenders" field with `List rest -> rest | _ -> [] in
  field :: rest

let assert_many_clients () =
  let operations = List.init 1000 (fun index -> write (Printf.sprintf "client-%04d" index) 1L index) in
  let state = Sync_engine_checkpoint.fold operations in
  assert (List.length (entries state) = 1000);
  assert (state = Sync_engine_checkpoint.fold (List.rev operations));
  assert (state = Sync_engine_checkpoint.fold [checkpoint state; checkpoint state]);
  let winner = List.hd (entries state) in
  assert (Yojson.Safe.Util.member "value" winner = `Int 999);
  List.iteri (fun index candidate ->
    assert (Yojson.Safe.Util.member "value" candidate = `Int (999 - index))) (entries state);
  let updated = write "client-0000" 2L 1001 in
  let next = Sync_engine_checkpoint.fold (operations @ [updated; List.hd operations; updated]) in
  assert (List.length (entries next) = 1000);
  assert (Yojson.Safe.Util.member "value" (List.hd (entries next)) = `Int 1001);
  assert (next = Sync_engine_checkpoint.fold [checkpoint state; updated]);
  let remove : crdt_operation =
    { table_name = "todos"; row_key = "r1"; dot = { client_id = "deleter"; version = 3L };
      payload = Remove_row { version_vector = List.init 1000 (fun index ->
        Printf.sprintf "client-%04d" index, 1L) } } in
  let retained = Sync_engine_checkpoint.fold [checkpoint state; remove; List.hd operations; updated] in
  assert (List.length (entries retained) = 1);
  assert (Yojson.Safe.Util.member "value" (List.hd (entries retained)) = `Int 1001);
  assert (retained = Sync_engine_checkpoint.fold [checkpoint retained]);
  assert (retained = Sync_engine_checkpoint.fold [remove; checkpoint state; updated])

let () = assert_many_clients ()
