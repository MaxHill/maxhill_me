open Minibuild.Shared
open Cmdliner

let run env =
  let* ctx = Minibuild.init env in
  Minibuild.Step.run_steps ~ctx [ Minibuild.install_system; Minibuild.Syncdb_server.run ]
;;

let deploy env =
  let* ctx = Minibuild.init env in
  Minibuild.Step.run_steps ~ctx [ Minibuild.install_system; Minibuild.Bootstrap.run ]
;;

let exit_with_result = function
  | Ok _ctx -> exit 0
  | Error err ->
    Format.eprintf "%s\n" (Minibuild.string_of_app_error err);
    exit 1
;;

let run_command eio_env =
  let doc = "Run syncdb-server locally." in
  let info = Cmd.info "run" ~doc in
  Cmd.v info Term.(const (fun () -> exit_with_result (run eio_env)) $ const ())
;;

let deploy_command eio_env =
  let doc = "Bootstrap VPS." in
  let info = Cmd.info "deploy" ~doc in
  Cmd.v info Term.(const (fun () -> exit_with_result (deploy eio_env)) $ const ())
;;

let command env =
  let doc = "Minibuild task runner." in
  let info = Cmd.info "minibuild" ~doc in
  Cmd.group info [ run_command env; deploy_command env ]
;;

let () = Eio_main.run @@ fun env -> exit (Cmd.eval (command env))
