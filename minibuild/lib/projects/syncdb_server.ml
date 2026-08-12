let run ~(ctx : Types.context) =
  let _app_dir = "apps/syncdb-server" in
  Cmd.run_cmd [| "which"; "dune" |]
;;
