open Shared
module Syncdb_server = Syncdb_server
module Shared = Shared

type context = Types.context

let reporter = Minibuild_reporter.reporter

let init env : (Types.context, string) result =
  Logs.warn (fun m -> m "initializing");
  Minibuild_reporter.with_indent
  @@ fun () ->
  let cwd = Eio.Path.(Eio.Stdenv.fs env / Unix.getcwd ()) in
  let* project_root =
    Cmd.find_upwards cwd "pnpm-workspace.yaml"
    |> Option.to_result ~none:"Could not find pnpm-workspace.yaml"
  in
  Ok Types.{ env; project_root }
;;

let install_system_tools ~(ctx : Types.context) =
  Logs.warn (fun m -> m "installing system tools");
  Minibuild_reporter.with_indent
  @@ fun () -> Cmd.run_cmd ~env:ctx.env [ "mise"; "install"; "--monorepo" ]
;;
