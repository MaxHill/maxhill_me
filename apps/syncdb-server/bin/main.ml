let src = Logs.Src.create "sync.main"

module Log = (val Logs.src_log src : Logs.LOG)

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
  let config = Sync.Config.init () in
  configure_logs config.log_level;
  let uri = Uri.make ~scheme:"sqlite3" ~path:config.db_path () in

  Log.info (fun m -> m "booting sync server");

  Eio_main.run @@ fun env ->
  Eio.Switch.run @@ fun sw ->
  let pool_config = Caqti_pool_config.create ~max_size:20 () in
  let db_pool =
    Caqti_eio_unix.connect_pool ~sw
      ~stdenv:(env :> Caqti_eio.stdenv)
      ~pool_config uri
    |> fail_on_caqti_error "connect_pool"
  in

  let auth =
    Sync.Auth.create env ~sw ~issuer_url:config.auth.issuer
      ~audience:config.auth.audience ~allowed_algs:config.auth.allowed_algs
    |> function
    | Ok auth -> auth
    | Error msg -> failwith ("auth init failed: " ^ msg)
  in

  Sync.Repository.init_schema_with_pool db_pool
  |> fail_on_repository_error "init_schema";
  let context = Sync.Server.{ db_pool; auth } in
  Sync.Server.start env ~sw ~port:config.port ~context
