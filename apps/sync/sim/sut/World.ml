let ( let* ) = Result.bind
let src = Logs.Src.create "simulator.world"

module Log = (val Logs.src_log src : Logs.LOG)

type t = {
  client : Client.t;
  client2 : Client.t;
  frng : FRNG.t;
  mutable step_n : int;
}

let init ~sw ~env (frng : FRNG.t) =
  let* db_name = FRNG.take_range_inclusive frng ~min:1 ~max:100_000 in
  let client =
    Client.spawn ~sw ~env
      ~cmd:[ "node"; "./sim/sut/test_client.js"; Int.to_string db_name ]
  in
  let client2 =
    Client.spawn ~sw ~env
      ~cmd:[ "node"; "./sim/sut/test_client.js"; Int.to_string db_name ]
  in
  Ok { client; client2; frng; step_n = 0 }

let check_properties _world = assert true

let step world : (unit, FRNG.frng_error) result =
  let* action = FRNG.swarm_weight_pick world.frng [ `Create_user ] in

  let* _ =
    match action with
    | `Create_user ->
        let* name = FRNG.take_string world.frng ~size:10 in
        let* key = FRNG.take_string world.frng ~size:10 in
        let user = Client.Create_user { key; name } in
        world.client.send user;
        (* TODO: Needs to check if  there actually is a message otherwise we could get stuck here *)
        let _ = Eio.Stream.take world.client.inbox in
        world.client2.send user;
        let _ = Eio.Stream.take world.client2.inbox in
        Ok ()
    | `Create_post ->
        let* title = FRNG.take_string world.frng ~size:10 in
        let* key = FRNG.take_string world.frng ~size:10 in
        let post = Client.Create_post { key; title } in
        world.client.send post;
        let _ = Eio.Stream.take world.client.inbox in
        world.client2.send post;
        let _ = Eio.Stream.take world.client2.inbox in
        Ok ()
  in

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
  w.client.send Client.Close;
  w.client2.send Client.Close;
  let _ = w.client.wait_for_exit () in
  let _ = w.client2.wait_for_exit () in
  ()
