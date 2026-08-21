open Shared
module Syncdb_server = Syncdb_server
module Bootstrap = Bootstrap
module Shared = Shared
module Step = Step

type context = Types.context

type app_error = Types.app_error =
  | CMD_Error of Types.command_error
  | String_error of string

let string_of_app_error = Types.string_of_app_error
let command_error_to_string = Types.command_error_to_string

let init env : (Types.context, Types.app_error) result =
  let reporter = Reporter.init () in
  let local_reporter = Reporter.append_prefix reporter "init" in
  Reporter.overprint local_reporter "finding project root";
  let cwd = Eio.Path.(Eio.Stdenv.fs env / Unix.getcwd ()) in
  let* project_root =
    Cmd.find_upwards cwd "pnpm-workspace.yaml"
    |> Option.to_result ~none:"Could not find pnpm-workspace.yaml"
    |> Result.map_error @@ fun e -> Types.String_error e
  in
  Ok Types.{ env; project_root; reporter }
;;

let install_system =
  Step.create
    ~name:"install system tools"
    ~should_skip:(fun ctx -> false)
    ~apply:(fun ctx ->
      let* _ =
        Cmd.run_cmd ~ctx [ "mise"; "install"; "--monorepo" ]
        |> Result.map_error @@ fun e -> Types.CMD_Error e
      in
      Ok ctx)
    ()
;;
