open Checkpoint_under_test
open Sync_engine_core

let operations clients rounds =
  List.init (clients * rounds) (fun index ->
    let client = index mod clients in
    let version = Int64.of_int (1 + index / clients) in
    { table_name = "todos"; row_key = "r1";
      dot = { client_id = Printf.sprintf "client-%04d" client; version };
      payload = Set_row { fields = `Assoc [ "title", `Int index ] } })

let benchmark clients rounds =
  let input = operations clients rounds in
  let iterations = 20 in
  Gc.full_major ();
  let allocated = Gc.allocated_bytes () in
  let start = Unix.gettimeofday () in
  for _ = 1 to iterations do
    ignore (Sys.opaque_identity (Sync_engine_checkpoint.fold input))
  done;
  let elapsed = (Unix.gettimeofday () -. start) /. float iterations in
  let bytes = (Gc.allocated_bytes () -. allocated) /. float iterations in
  Printf.printf "clients=%d rounds=%d operations=%d ms=%.3f allocated_bytes=%.0f\n%!"
    clients rounds (List.length input) (elapsed *. 1000.) bytes

let () = List.iter (fun clients -> benchmark clients 1; benchmark clients 10) [10; 100; 1000]
