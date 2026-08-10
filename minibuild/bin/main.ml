open Cmdliner


 let run name = print_endline (Minibuild.greet name)

let command = 
    let name = 
        let doc = "Name to greet." in
        Arg.(value & opt string "World" & info [ "name" ] ~docv:"NAME" ~doc)
    in
    let info = Cmd.info "minibuild" ~doc:"Print a greeting" in
    Cmd.v info Term.(const run $ name)

let () = exit (Cmd.eval command)
