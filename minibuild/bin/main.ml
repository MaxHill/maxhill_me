open Minibuild.Shared
open Cmdliner

let run name =
  let res =
    Minibuild.init ()
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

let command =
  let name =
    let doc = "Name to greet." in
    Arg.(value & opt string "World" & info [ "name" ] ~docv:"NAME" ~doc)
  in
  let info = Cmd.info "minibuild" ~doc:"Print a greeting" in
  Cmd.v info Term.(const run $ name)
;;

let () = exit (Cmd.eval command)
