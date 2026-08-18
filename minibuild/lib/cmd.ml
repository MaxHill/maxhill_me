let%expect_test "command error includes diagnostic context" =
  Types.command_error_to_string
    { argv = [ "mise"; "install"; "--monorepo" ]
    ; status = `Exited 1
    ; stderr = "plugin download failed"
    }
  |> print_endline;
  [%expect
    {|
    command failed: mise install --monorepo
    exit status: Exited (code 1)
    stderr:
    plugin download failed
    |}]
;;

let run_cmd ?cwd ~(ctx : Types.context) (argv : string list)
  : (string, Types.command_error) result
  =
  Eio.Switch.run
  @@ fun sw ->
  let proc_mgr = Eio.Stdenv.process_mgr ctx.env in
  let stdout_read, stdout_write = Eio.Process.pipe ~sw proc_mgr in
  let stderr_read, stderr_write = Eio.Process.pipe ~sw proc_mgr in
  Reporter.overprint
    ctx.reporter
    (Format.sprintf " %s" (String.concat " " argv));
  let child =
    Eio.Process.spawn
      ?cwd
      ~sw
      ~stdout:stdout_write
      ~stderr:stderr_write
      proc_mgr
      argv
  in
  Eio.Flow.close stdout_write;
  Eio.Flow.close stderr_write;
  let stdout, stderr =
    Eio.Fiber.pair
      (fun () ->
         let buf = Eio.Buf_read.of_flow ~max_size:max_int stdout_read in
         Eio.Buf_read.take_all buf)
      (fun () ->
         let buf = Eio.Buf_read.of_flow ~max_size:max_int stderr_read in
         Eio.Buf_read.take_all buf)
  in
  (* Print captured output after command completes *)
  if stdout <> "" then print_endline ("\n" ^ stdout);
  if stderr <> "" then print_endline ("\n" ^ stderr);
  match Eio.Process.await child with
  | `Exited 0 -> Ok stdout
  | (`Exited _ | `Signaled _) as status -> Error { Types.argv; status; stderr }
;;

let%expect_test "run_cmd basics" =
  let display_command_result (cmd_error : (string, Types.command_error) result) =
    match cmd_error with
    | Ok returned -> Printf.eprintf "returned: Ok %s\n" returned
    | Error { argv; status; stderr } ->
      Format.eprintf
        "returned: Error command=%a status=%a stderr=%b\n"
        Eio.Process.pp_args
        argv
        Eio.Process.pp_status
        status
        (stderr <> "")
  in
  (Eio_main.run
   @@ fun env ->
   let ctx =
     Types.
       { env
       ; project_root = Eio.Path.(Eio.Stdenv.cwd env / ".")
       ; reporter = Reporter.init ()
       }
   in
   Printf.eprintf "command that prints to stdout:\n";
   run_cmd ~ctx [ "echo"; "-n"; "hello there" ] |> display_command_result;
   Printf.eprintf "command that prints to stderr:\n";
   run_cmd ~ctx [ "ls"; "./this-path-does-not-exist" ])
  |> display_command_result;
  [%expect
    {|
    hello there
    ls: cannot access './this-path-does-not-exist': No such file or directory

    command that prints to stdout:
    returned: Ok hello there
    command that prints to stderr:
    [K[2m[0m[run]: echo -n hello there[K[2m[0m[run]: ls ./this-path-does-not-existreturned: Error command=
    ls ./this-path-does-not-exist status=Exited (code 2) stderr=true
    |}]
;;

let remote_cmd ~ctx vps_host remote_cmd =
  run_cmd ~ctx [ "ssh"; vps_host; remote_cmd ]
;;

let launch_cmd ?cwd argv =
  let cwd = Option.bind cwd Eio.Path.native in
  if Array.length argv = 0 then invalid_arg "launch: argv must not be empty";
  let previous_cwd = Unix.getcwd () in
  Option.iter Unix.chdir cwd;
  try Unix.execvp argv.(0) argv with
  | exn ->
    Unix.chdir previous_cwd;
    raise exn
;;

let rec find_upwards path filename =
  let candidate = Eio.Path.(path / filename) in
  if Eio.Path.is_file candidate
  then Some path
  else (
    match Eio.Path.split path with
    | None -> None
    | Some (parent, _) -> find_upwards parent filename)
;;

let%expect_test "find root" =
  let create_temp_dir env =
    let fs = Eio.Stdenv.fs env in
    Filename.temp_dir "minibuild-" "-test" |> fun path -> Eio.Path.(fs / path)
  in
  let fill_sub_dir temp_dir =
    let nested = Eio.Path.(temp_dir / "a" / "b") in
    Eio.Path.mkdirs ~perm:0o700 nested;
    Eio.Path.save
      ~create:(`Or_truncate 0o600)
      Eio.Path.(temp_dir / "needle.txt")
      "";
    nested
  in
  Eio_main.run
  @@ fun env ->
  let temp_dir = create_temp_dir env in
  Fun.protect
    ~finally:(fun () -> Eio.Path.rmtree ~missing_ok:true temp_dir)
    (fun () ->
       let nested = fill_sub_dir temp_dir in
       match find_upwards nested "needle.txt" with
       | Some root ->
         print_endline
           (Bool.to_string
              (Eio.Path.native_exn root = Eio.Path.native_exn temp_dir))
       | None -> print_endline "not found");
  [%expect {| true |}]
;;
