open Minibuild.Shared
open Cmdliner

let run env =
  let* ctx = Minibuild.init env in
  Minibuild.Step.run_steps
    ~ctx
    [ Minibuild.install_system; Minibuild.Syncdb_server.run ]
;;

let command_handler env _verbosity _quiet name =
  match run env with
  | Ok _ctx -> exit 0
  | Error err ->
    Format.eprintf "%s\n" (Minibuild.string_of_app_error err);
    exit 1
;;

let command eio_env =
  let verbosity =
    let doc = "Increase verbosity (-v, -vv, --verbose)." in
    Arg.(value & flag_all & info [ "v"; "verbose" ] ~doc)
  in
  let quiet =
    let doc = "Quiet mode (-q)." in
    Arg.(value & flag & info [ "q" ] ~doc)
  in
  let name =
    let doc = "Name to greet." in
    Arg.(value & opt string "World" & info [ "name" ] ~docv:"NAME" ~doc)
  in
  let info = Cmd.info "minibuild" ~doc:"Print a greeting" in
  Cmd.v
    info
    Term.(const command_handler $ const eio_env $ verbosity $ quiet $ name)
;;

let () = Eio_main.run @@ fun env -> exit (Cmd.eval (command env))
