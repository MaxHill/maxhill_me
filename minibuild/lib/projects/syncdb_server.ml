open Shared

(*   opam exec --switch=. -- dune runtest --no-buffer -j1 *)

let step_install_dependencies =
  Step.create
    ~name:"Install dependencies"
    ~apply:(fun ctx ->
      let project_path = Eio.Path.(ctx.project_root / "apps/syncdb-server") in
      let* _ =
        Cmd.run_cmd
          ~ctx
          ~cwd:project_path
          [ "opam"
          ; "install"
          ; "."
          ; "--switch=."
          ; "--deps-only"
          ; "--with-test"
          ; "--yes"
          ]
        |> Result.map_error (fun e -> Types.CMD_Error e)
      in
      Ok ctx)
    ()

and step_create_opam_switch =
  Step.create
    ~name:"Create opam switch"
    ~should_skip:(fun ctx ->
      let opam_path =
        Eio.Path.(ctx.project_root / "apps/syncdb-server/_opam")
      in
      Eio.Path.is_directory opam_path)
    ~apply:(fun ctx ->
      let project_path = Eio.Path.(ctx.project_root / "apps/syncdb-server") in
      let* _ =
        Cmd.run_cmd
          ~ctx
          ~cwd:project_path
          [ "opam"
          ; "switch"
          ; "create"
          ; "."
          ; "ocaml-base-compiler.5.2.0"
          ; "--yes"
          ]
        |> Result.map_error (fun e -> Types.CMD_Error e)
      in
      Ok ctx)
    ()
;;

let run =
  Step.create
    ~name:"run sync server"
    ~should_skip:(fun ctx -> false)
    ~apply:(fun ctx ->
      let ctx = Types.append_prefix ctx "syncdb-server" in
      let ctx = Types.append_prefix ctx "run" in
      let project_path = Eio.Path.(ctx.project_root / "apps/syncdb-server") in
      let* ctx = Step.run_step ~ctx step_create_opam_switch in
      let* ctx = Step.run_step ~ctx step_install_dependencies in
      let* _ =
        Cmd.launch_cmd
          ~cwd:project_path
          [| "opam"
           ; "exec"
           ; "--switch=."
           ; "--"
           ; "dune"
           ; "exec"
           ; "./bin/main.exe"
          |]
        |> Result.map_error (fun e -> Types.CMD_Error e)
      in
      Ok ctx)
    ()
;;
