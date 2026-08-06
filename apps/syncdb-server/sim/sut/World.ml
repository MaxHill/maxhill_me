open Shared

let ( let* ) = Result.bind
let src = Logs.Src.create "simulator.world"

module Log = (val Logs.src_log src : Logs.LOG)

let init ~sw ~env (frng : FRNG.t) (db_conn : connection) :
    (world, FRNG.frng_error) result =
  let db_name_max = 2 in
  let* db_name = FRNG.take_range_inclusive frng ~min:1 ~max:db_name_max in
  let db_name = Int.to_string db_name in
  let* number_of_clients = FRNG.take_range_inclusive frng ~min:1 ~max:20 in
  let clients =
    List.init number_of_clients (fun i ->
        Client.spawn ~sw ~env
          ~cmd:
            [
              "node";
              "./sim/sut/test_client.js";
              db_name;
              Printf.sprintf "%s-%d" db_name i;
            ])
  in
  let tenant_key = db_name ^ ":sim-user" in
  let clock = Eio.Stdenv.clock env in

  Ok
    {
      clients;
      frng;
      step_n = 0;
      db_conn;
      clock;
      action_timeout = 5.0;
      tenant_key;
      last_count_operations = None;
      last_max_server_version = None;
    }

let step ~client world : (unit, FRNG.frng_error) result =
  (* Send a request to the sync engine *)

  (* Take actions on clients.
   TODO:
       Delete user/post
       Update user/post
       Read from index user/post
       *)
  let* action = FRNG.swarm_weight_pick world.frng Client.actions in
  let* outgoing = Client.outgoing_of_action world.frng client action in
  client.send outgoing;

  wait_for_response ~client ~world ~action:(Client.action_to_string action)
  |> Result.iter (function
    | Client.Ack -> ()
    | Client.Sync_request request ->
        Request_broker.handle_sync_request ~client ~world request |> ignore);

  world.step_n <- world.step_n + 1;
  Property_validators.check_properties world;
  Ok ()

let all_results array_of_result =
  List.fold_right
    (fun x acc ->
      match (x, acc) with
      | Error e, _ -> Error e
      | Ok v, Ok vs -> Ok (v :: vs)
      | _, Error e -> Error e)
    array_of_result (Ok [])

let run (world : world) =
  let rec loop () =
    Printf.eprintf "\r%-50s"
      (Printf.sprintf "Progress: %.1f%%" (FRNG.progress world.frng *. 100.0));
    flush stderr;
    let client_steps =
      List.map (fun client -> step ~client world) world.clients |> all_results
    in
    match client_steps with Ok _ -> loop () | Error FRNG.Out_of_entropy -> ()
  in
  loop ();

  Printf.eprintf "\r%-50s" "Progress: 100.0%";
  Printf.eprintf "\n";
  flush stderr;

  Log.info (fun m -> m "Run complete, cleaning up");

  List.iter
    (fun (client : Client.t) ->
      client.send Client.Close_msg;
      let close_result =
        Eio.Time.with_timeout world.clock world.action_timeout (fun () ->
            ignore (client.wait_for_exit ());
            Ok ())
      in
      match close_result with
      | Ok () -> ()
      | Error `Timeout ->
          Log.warn (fun m ->
              m "Graceful close timed out after %.3fs; force-closing TS client"
                world.action_timeout);
          client.force_close ();
          ignore (client.wait_for_exit ()))
    world.clients
