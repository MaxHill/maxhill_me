open Shared
module Syncdb_server = Syncdb_server
module Shared = Shared

type context = Types.context

let init env : (Types.context, string) result =
  let cwd = Eio.Path.(Eio.Stdenv.fs env / Unix.getcwd ()) in
  let* project_root =
    Cmd.find_upwards cwd "pnpm-workspace.yaml"
    |> Option.to_result ~none:"Could not find pnpm-workspace.yaml"
  in
  let _ = Cmd.run_cmd ~env [ "mise"; "install"; "--monorepo" ] in
  let _ = Cmd.run_cmd ~env [ "echo"; "test" ] in
  Ok Types.{ env; project_root }
;;
