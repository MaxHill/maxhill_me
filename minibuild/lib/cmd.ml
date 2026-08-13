let rec run_cmd ~env (argv : string list) : (string, string) result =
  Eio.Switch.run
  @@ fun sw ->
  let proc_mgr = Eio.Stdenv.process_mgr env in
  let stdout_read, stdout_write = Eio.Process.pipe ~sw proc_mgr in
  let stderr_read, stderr_write = Eio.Process.pipe ~sw proc_mgr in
  Logs.debug (fun m -> m "executing: %s" (String.concat " " argv));
  Minibuild_reporter.with_indent
  @@ fun () ->
  let child =
    Eio.Process.spawn
      ~sw
      ~stdout:stdout_write
      ~stderr:stderr_write
      proc_mgr
      argv
  in
  Eio.Flow.close stdout_write;
  Eio.Flow.close stderr_write;
  let output, _stderr_output =
    Eio.Fiber.pair
      (fun () ->
         print_std ~flow:stdout_read ~prefix:"[stdout]" ~logger:Logs.debug)
      (fun () ->
         print_std ~flow:stderr_read ~prefix:"[stderr]" ~logger:Logs.info)
  in
  match Eio.Process.await child with
  | `Exited 0 -> Ok output
  | `Exited code -> Error (Format.sprintf "process exited with code %d" code)
  | `Signaled signal ->
    Error (Format.sprintf "process killed by signal %d" signal)

and print_std ~flow ~prefix ~logger =
  let buf = Eio.Buf_read.of_flow ~max_size:max_int flow in
  let lines = Eio.Buf_read.lines buf |> List.of_seq in
  List.iter (fun line -> logger (fun m -> m "%s %s" prefix line)) lines;
  String.concat "\n" lines
;;

let%expect_test "run_cmd basics" =
  let display_command_result result =
    match result with
    | Ok returned -> Printf.eprintf "returned: Ok %s\n" returned
    | Error returned -> Printf.eprintf "returned: Error %s\n" returned
  in
  (Eio_main.run
   @@ fun env ->
   Printf.eprintf "command that prints to stdout:\n";
   run_cmd ~env [ "echo"; "-n"; "hello there" ] |> display_command_result;
   Printf.eprintf "command that prints to stderr:\n";
   run_cmd ~env [ "ls"; "./this-path-does-not-exist" ])
  |> display_command_result;
  [%expect
    {|
    command that prints to stdout:
    returned: Ok hello there
    command that prints to stderr:
    returned: Error process exited with code 2
    |}]
;;

let remote_cmd ~env vps_host remote_cmd =
  run_cmd ~env [ "ssh"; vps_host; remote_cmd ]
;;

(* Will return for example:
file_permission "some_file.txt" = 0o600*)
let file_permission p = (Unix.stat p).Unix.st_perm

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
