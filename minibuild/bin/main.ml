open Minibuild.Shared
open Cmdliner

let command_handler env level name =
  Logs.set_level level;
  let res =
    Minibuild.init env
    |> result_bind ~f:(fun ctx ->
      match Minibuild.install_system_tools ~ctx with
      | Ok res -> Ok ctx
      | Error err ->
        Logs.err (fun m -> m "error: %s" err);
        Error err)
    |> result_bind ~f:(fun ctx ->
      match Minibuild.Syncdb_server.run ~ctx with
      | Ok res -> Ok ctx
      | Error err ->
        Logs.err (fun m -> m "error: %s" err);
        Error err)
  in
  match res with
  | Ok _ -> exit 0
  | Error err ->
    Logs.err (fun m -> m "error: %s" err);
    exit 1
;;

let command eio_env =
  let level = Logs_cli.level () in
  let name =
    let doc = "Name to greet." in
    Arg.(value & opt string "World" & info [ "name" ] ~docv:"NAME" ~doc)
  in
  let info = Cmd.info "minibuild" ~doc:"Print a greeting" in
  Cmd.v info Term.(const command_handler $ const eio_env $ level $ name)
;;

let () =
  Fmt_tty.setup_std_outputs ~style_renderer:`Ansi_tty ();
  Logs.set_reporter (Minibuild.reporter ());
  Logs.set_level (Some Logs.Info);
  Eio_main.run @@ fun env -> exit (Cmd.eval (command env))
;;
