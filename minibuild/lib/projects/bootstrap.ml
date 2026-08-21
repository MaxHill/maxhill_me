open Shared

let ssh_host host = Printf.sprintf "ubuntu@%s" host

let require_vps_host () =
  match Sys.getenv_opt "VPS_HOST" with
  | Some host when String.trim host <> "" -> Ok (String.trim host)
  | _ ->
    Error
      (Types.String_error
         "VPS_HOST is required (set it in mise env or shell env before running bootstrap)")
;;

let run =
  Step.create
    ~name:"bootstrap vps"
    ~apply:(fun ctx ->
      let* host = require_vps_host () in
      let target = ssh_host host in
      let repo_root = Eio.Path.native_exn ctx.project_root in
      let vps_dir = Filename.concat repo_root "vps/" in
      let* _ =
        Cmd.remote_cmd ~ctx target "sudo mkdir -p /opt/bootstrap/vps"
        |> Result.map_error (fun e -> Types.CMD_Error e)
      in
      let* _ =
        Cmd.run_cmd
          ~ctx
          [ "rsync"
          ; "-a"
          ; "--delete"
          ; vps_dir
          ; Printf.sprintf "%s:/tmp/bootstrap-vps/" target
          ]
        |> Result.map_error (fun e -> Types.CMD_Error e)
      in
      let remote_cmd =
        "sudo rsync -a --delete /tmp/bootstrap-vps/ /opt/bootstrap/vps/ && sudo bash /opt/bootstrap/vps/bootstrap.sh"
      in
      let* _ =
        Cmd.remote_cmd ~ctx target remote_cmd
        |> Result.map_error (fun e -> Types.CMD_Error e)
      in
      Ok ctx)
    ()
;;
