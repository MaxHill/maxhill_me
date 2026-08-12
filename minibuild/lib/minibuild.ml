open Shared
module Syncdb_server = Syncdb_server
module Shared = Shared

type context = Types.context

let init () : (Types.context, string) result =
  let* project_root = Cmd.find_project_root () in
  Unix.chdir project_root;
  let _ = Cmd.run_cmd ~quiet:false [| "mise"; "install"; "--monorepo" |] in
  let _ = Cmd.run_cmd ~quiet:false [| "echo"; "test" |] in
  Ok Types.{ project_root }
;;
