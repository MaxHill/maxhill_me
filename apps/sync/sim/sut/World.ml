let ( let* ) = Result.bind

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
  Eio.Std.traceln " step: %d" world.step_n;
  check_properties world;
  Ok ()

let run w =
  Eio.Std.traceln "new run";
  let rec loop () =
    match step w with Ok () -> loop () | Error FRNG.Out_of_entropy -> ()
  in
  loop ();

  Eio.Std.traceln " Run complete, cleaning up";
  w.client.send Client.Close;
  let _ = w.client.wait_for_exit () in
  ()
