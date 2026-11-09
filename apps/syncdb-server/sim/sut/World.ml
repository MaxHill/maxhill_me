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
  let tenant_id = "sim-user" in
  let clock = Eio.Stdenv.clock env in

  Ok
    {
      clients;
      frng;
      step_n = 0;
      db_conn;
      clock;
      action_timeout = 5.0;
      tenant_id;
      db_name;
      last_max_server_version = None;
      coverage = Coverage.create ();
    }

type random_action = Client_action of Client.random_actions | Compact_row_action

let random_actions =
  List.map (fun action -> Client_action action) Client.actions
  @ [ Compact_row_action ]

let server_rows_query =
  let open Caqti_request.Infix in
  (Caqti_type.(t2 string string) ->* Caqti_type.(t2 string string))
    "SELECT DISTINCT table_name, row_key FROM crdt_operations WHERE tenant_id = ? AND db_name = ? ORDER BY table_name, row_key"

let compact_random_server_row world =
  let module Db = (val world.db_conn : Caqti_eio.CONNECTION) in
  match Db.collect_list server_rows_query (world.tenant_id, world.db_name) with
  | Error error -> failwith (Caqti_error.show error)
  | Ok [] -> Ok ()
  | Ok server_rows ->
      let* selected_index = FRNG.take_index world.frng server_rows in
      let table_name, row_key = List.nth server_rows selected_index in
      let latest =
        match Sync.Repository.get_max_server_version world.db_conn
                ~tenant_id:world.tenant_id ~db_name:world.db_name with
        | Ok version -> version
        | Error error -> failwith (Sync.Repository.error_to_string error)
      in
      let cutoff = Int64.succ latest in
      let before_rows =
        match Sync.Repository.get_row_prefix world.db_conn ~tenant_id:world.tenant_id
                ~db_name:world.db_name ~table_name ~row_key
                ~before_server_version:Int64.max_int with
        | Ok rows -> rows
        | Error error -> failwith (Sync.Repository.error_to_string error)
      in
      let removed_rows =
        List.filter
          (fun (row : Sync.Repository.db_crdt_operation) ->
            Int64.compare row.server_version cutoff < 0)
          before_rows
      in
      match
        Sync.Sync_engine.compact_row_with_connection world.db_conn
          ~tenant_id:world.tenant_id ~db_name:world.db_name ~table_name ~row_key
          ~checkpoint_seen_server_version:cutoff
      with
      | Error error -> failwith (Sync.Sync_engine.sync_error_to_string error)
      | Ok checkpoint ->
          let after_rows =
            match Sync.Repository.get_row_prefix world.db_conn ~tenant_id:world.tenant_id
                    ~db_name:world.db_name ~table_name ~row_key
                    ~before_server_version:Int64.max_int with
            | Ok rows -> rows
            | Error error -> failwith (Sync.Repository.error_to_string error)
          in
          (match
             Simulator_invariants.validate_prefix_replacement ~cutoff ~before_rows
               ~after_rows ~checkpoint_client_id:checkpoint.dot.client_id
               ~checkpoint_version:checkpoint.dot.version
           with
          | Error error -> failwith ("CHECKPOINT_PREFIX_VALIDATION_FAIL: " ^ error)
          | Ok () -> ());
          Coverage.record_compaction world.coverage ~table_name ~row_key
            ~removed_rows;
          Ok ()

let perform_client_action ~client world action =
  let* outgoing = Client.outgoing_of_action world.frng client action in
  client.send outgoing;
  wait_for_response ~client ~world ~action:(Client.action_to_string action)
  |> Result.iter (function
    | Client.Ack -> ()
    | Client.Sync_request request ->
        Request_broker.handle_sync_request ~client ~world request |> ignore);
  Ok ()

let step ~client world : (unit, FRNG.frng_error) result =
  let* () = Request_broker.tick ~world in
  let* action = FRNG.swarm_weight_pick world.frng random_actions in
  let* () =
    match action with
    | Compact_row_action -> compact_random_server_row world
    | Client_action client_action -> perform_client_action ~client world client_action
  in
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
