let run ~(ctx : Types.context) =
  Logs.warn (fun m -> m "syncdb-server run");
  Minibuild_reporter.with_indent
  @@ fun () ->
  let _app_dir = "apps/syncdb-server" in
  Cmd.run_cmd ~env:ctx.env [ "which"; "dune" ]
;;
