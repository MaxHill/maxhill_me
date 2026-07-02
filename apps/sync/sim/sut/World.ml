open Shared

let ( let* ) = Result.bind
let src = Logs.Src.create "simulator.world"

module Log = (val Logs.src_log src : Logs.LOG)

let init ~sw ~env (frng : FRNG.t) (db_pool : pool) :
    (world, FRNG.frng_error) result =
  let* db_name = FRNG.take_range_inclusive frng ~min:1 ~max:100_000 in
  let client =
    Client.spawn ~sw ~env
      ~cmd:[ "node"; "./sim/sut/test_client.js"; Int.to_string db_name ]
  in
  let clock = Eio.Stdenv.clock env in
  Ok { client; frng; step_n = 0; db_pool; clock; action_timeout = 5.0 }

let check_properties _world = assert true

let step world : (unit, FRNG.frng_error) result =
  (* Send a request to the sync engine *)

  (* Take actions on clients.
   TODO:
       Delete user/post
       Update user/post
       Read user/post
       Read from index user/post
       *)
  let* action = FRNG.swarm_weight_pick world.frng Client.actions in
  let* outgoing = Client.outgoing_of_action world.frng action in
  world.client.send outgoing;

  wait_for_response ~world ~action:(Client.action_to_string action)
  |> Result.iter (function
    | Client.Ack -> ()
    | Client.Sync_request request ->
        Request_broker.handle_sync_request ~world request |> ignore);

  world.step_n <- world.step_n + 1;
  check_properties world;
  Ok ()

let run w =
  let rec loop () =
    Printf.eprintf "\r%-50s"
      (Printf.sprintf "Progress: %.1f%%" (FRNG.progress w.frng *. 100.0));
    flush stderr;
    match step w with Ok () -> loop () | Error FRNG.Out_of_entropy -> ()
  in
  loop ();

  Printf.eprintf "\r%-50s" "Progress: 100.0%";
  Printf.eprintf "\n";
  flush stderr;

  Log.info (fun m -> m "Run complete, cleaning up");
  w.client.send Client.Close_msg;
  let close_result =
    Eio.Time.with_timeout w.clock w.action_timeout (fun () ->
        ignore (w.client.wait_for_exit ());
        Ok ())
  in
  (match close_result with
  | Ok () -> ()
  | Error `Timeout ->
      Log.warn (fun m ->
          m "Graceful close timed out after %.3fs; force-closing TS client"
            w.action_timeout);
      w.client.force_close ();
      ignore (w.client.wait_for_exit ()));
  ()
