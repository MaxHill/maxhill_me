open Minibuild.Shared
open Cmdliner

let command_handler env level name =
  Logs.set_level level;
  let res =
    match Minibuild.init env with
    | Error err -> Error err
    | Ok ctx ->
      (match Minibuild.install_system_tools ~ctx with
       | Error err ->
         Error
           (Format.sprintf
              "installing system tools failed\n%s"
              (Minibuild.command_error_to_string err))
       | Ok _ ->
         (match Minibuild.Syncdb_server.run ~ctx with
          | Error err ->
            Error
              (Format.sprintf
                 "syncdb-server failed\n%s"
                 (Minibuild.command_error_to_string err))
          | Ok _ -> Ok ()))
  in
  match res with
  | Ok () -> exit 0
  | Error err ->
    Logs.err (fun m -> m "%s" err);
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
