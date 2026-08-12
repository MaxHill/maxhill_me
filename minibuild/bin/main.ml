open Minibuild.Shared
open Cmdliner

let command_handler env name =
  let res =
    Minibuild.init env
    |> Fun.flip Result.bind (fun ctx ->
      match Minibuild.Syncdb_server.run ~ctx with
      | Ok res -> Ok ctx
      | Error err ->
        print_endline ("error: " ^ err);
        exit 1)
  in
  match res with
  | Ok ctx -> exit 0
  | Error err ->
    print_endline ("error: " ^ err);
    exit 1
;;

let command eio_env =
  let name =
    let doc = "Name to greet." in
    Arg.(value & opt string "World" & info [ "name" ] ~docv:"NAME" ~doc)
  in
  let info = Cmd.info "minibuild" ~doc:"Print a greeting" in
  Cmd.v info Term.(const command_handler $ const eio_env $ name)
;;

let () = Eio_main.run @@ fun env -> exit (Cmd.eval (command env))
