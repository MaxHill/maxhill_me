let ( let* ) = Result.bind
let src = Logs.Src.create "simulator.world"

module Log = (val Logs.src_log src : Logs.LOG)

type t = { client : Client.t; frng : FRNG.t; mutable step_n : int }

let init ~sw ~env (frng : FRNG.t) =
  let client =
    Client.spawn ~sw ~env ~cmd:[ "node"; "./sim/sut/test_client.js" ]
  in
  Ok { client; frng; step_n = 0 }

let check_properties _world = assert true

let step world : (unit, FRNG.frng_error) result =
  let* action = FRNG.swarm_weight_pick world.frng [ `Ping ] in

  let _ =
    match action with
    | `Ping ->
        world.client.send (Client.Ping { step = world.step_n });
        let _ = Eio.Stream.take world.client.inbox in
        ()
  in

  world.step_n <- world.step_n + 1;
  Log.debug (fun m -> m " step: %d" world.step_n);
  check_properties world;
  Ok ()

let run w =
  Log.info (fun m -> m "new run");
  let rec loop () =
    Printf.eprintf "\r%-50s"
      (Printf.sprintf "Progress: %.1f%%" (FRNG.progress w.frng *. 100.0));
    flush stderr;
    match step w with Ok () -> loop () | Error FRNG.Out_of_entropy -> ()
  in
  loop ();

  Printf.eprintf "\n";
  flush stderr;

  Log.debug (fun m -> m "Run complete, cleaning up");
  w.client.send Client.Close;
  let _ = w.client.wait_for_exit () in
  ()
