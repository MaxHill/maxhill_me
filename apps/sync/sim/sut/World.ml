let ( let* ) = Result.bind
let src = Logs.Src.create "simulator.world"
let request_queue = Queue.create ()
(* let response_queue = Queue.create () *)

module Log = (val Logs.src_log src : Logs.LOG)

type connection = (module Caqti_eio.CONNECTION)
type pool = (connection, Caqti_error.t) Caqti_eio.Pool.t

type t = {
  client : Client.t;
  frng : FRNG.t;
  mutable step_n : int;
  db_pool : pool;
}

let init ~sw ~env (frng : FRNG.t) (db_pool : pool) =
  let* db_name = FRNG.take_range_inclusive frng ~min:1 ~max:100_000 in
  let client =
    Client.spawn ~sw ~env
      ~cmd:[ "node"; "./sim/sut/test_client.js"; Int.to_string db_name ]
  in
  Ok { client; frng; step_n = 0; db_pool }

let check_properties _world = assert true

let step world : (unit, FRNG.frng_error) result =
  (* Send a request to the sync engine *)
  (* todo:
      - Maybe drop request
      - Maybe drop response
      - Maybe delay request
      - Maybe delay response
      - Maybe corrupt request
      - Maybe corrupt response
      *)
  let _ =
    match Queue.take_opt request_queue with
    | Some request ->
        ignore
          (Caqti_eio.Pool.use
             (fun conn ->
               Ok
                 (Sync.Sync_engine.process_sync_request_with_connection conn
                    request))
             world.db_pool)
    | None -> ()
  in

  (* Take actions on clients.
   TODO:
       Delete user/post
       Update user/post
       Read user/post
       Read from index user/post
       *)
  let* action = FRNG.swarm_weight_pick world.frng [ `Create_user ] in
  let* _ =
    match action with
    | `Create_user ->
        let* name = FRNG.take_string world.frng ~size:10 in
        let* key = FRNG.take_string world.frng ~size:10 in
        let user = Client.Create_user { key; name } in
        world.client.send user;
        Ok ()
    | `Create_post ->
        let* title = FRNG.take_string world.frng ~size:10 in
        let* key = FRNG.take_string world.frng ~size:10 in
        let post = Client.Create_post { key; title } in
        world.client.send post;
        Ok ()
  in

  (* TODO: Needs to check if  there actually is a message otherwise we could get stuck here *)
  let msg = Eio.Stream.take world.client.inbox in
  let _ =
    match msg with
    | Pong -> ()
    | Sync_request req -> Queue.add req request_queue
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
  let _ = w.client.wait_for_exit () in
  ()
