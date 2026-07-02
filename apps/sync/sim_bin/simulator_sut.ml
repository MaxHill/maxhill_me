let src = Logs.Src.create "sut.main"

module Log = (val Logs.src_log src : Logs.LOG)

let parse_log_level_from_env () =
  match Sys.getenv_opt "SIM_LOG_LEVEL" with
  | None -> Some Logs.Error
  | Some value -> (
      match Logs.level_of_string (String.lowercase_ascii value) with
      | Ok level -> level
      | Error (`Msg msg) -> failwith ("invalid --log-level: " ^ msg))

let configure_logs log_level =
  Logs.set_reporter (Logs_fmt.reporter ());
  Logs.set_level ~all:true log_level

let fail_on_caqti_error action = function
  | Ok value -> value
  | Error err ->
      failwith (Printf.sprintf "%s failed: %s" action (Caqti_error.show err))

let fail_on_repository_error action = function
  | Ok value -> value
  | Error err ->
      failwith
        (Printf.sprintf "%s failed: %s" action
           (Sync.Repository.error_to_string err))

let () =
  configure_logs (parse_log_level_from_env ());
  let entropy = In_channel.input_all stdin in
  let frng = Sync_simulator.FRNG.init entropy in
  let db_uri = Uri.make ~scheme:"sqlite3" ~path:":memory:" () in

  Log.debug (fun m -> m "Setting up in-memory database");
  Eio_main.run @@ fun env ->
  Eio.Switch.run @@ fun sw ->
  (* NOTE: sqlite3 :memory: is per-connection. If pool has >1 connection,
     some connections won't see schema created on another connection,
     causing intermittent "no such table: crdt_operations" failures.
     Keep pool at 1 connection in simulator for deterministic behavior. *)
  let pool_config = Caqti_pool_config.create ~max_size:1 () in
  let db_pool =
    Caqti_eio_unix.connect_pool ~sw
      ~stdenv:(env :> Caqti_eio.stdenv)
      ~pool_config db_uri
    |> fail_on_caqti_error "connect_pool"
  in
  Sync.Repository.init_schema_with_pool db_pool
  |> fail_on_repository_error "init_schema";

  match Sync_simulator.World.init ~sw ~env frng db_pool with
  | Error Sync_simulator.FRNG.Out_of_entropy ->
      (* not enough entropy to even start the world — innocent *)
      ()
  | Ok w -> Sync_simulator.World.run w
