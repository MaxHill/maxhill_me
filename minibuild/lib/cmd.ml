let rec run_cmd ~env (argv : string list) : (string, string) result =
  Eio.Switch.run
  @@ fun sw ->
  let proc_mgr = Eio.Stdenv.process_mgr env in
  let stdout_read, stdout_write = Eio.Process.pipe ~sw proc_mgr in
  let stderr_read, stderr_write = Eio.Process.pipe ~sw proc_mgr in
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
  let output, () =
    Eio.Fiber.pair
      (fun () ->
         Eio.Buf_read.parse_exn ~max_size:max_int process_stdout stdout_read)
      (fun () ->
         Eio.Buf_read.parse_exn ~max_size:max_int process_stderr stderr_read)
  in
  match Eio.Process.await child with
  | `Exited 0 -> Ok output
  | `Exited code -> Error (Format.sprintf "process exited with code %d" code)
  | `Signaled signal ->
    Error (Format.sprintf "process killed by signal %d" signal)

(*Flusing each character is not the most performant
but it's simple and with the size of the 
outputs we're dealing with here it 
should be fine*)
and process_stderr buf_read =
  let at_line_start = ref true in
  Eio.Buf_read.seq
    ~stop:Eio.Buf_read.at_end_of_input
    Eio.Buf_read.any_char
    buf_read
  |> Seq.iter
     @@ fun char ->
     if !at_line_start then output_string stderr "[stderr] ";
     output_char stderr char;
     flush stderr;
     at_line_start := char = '\n'

(*Flusing each character is not the most performant 
but it's simple and with the size of the 
outputs we're dealing with here it 
should be fine*)
and process_stdout buf_read =
  let captured = Buffer.create 4096 in
  let at_line_start = ref true in
  Eio.Buf_read.seq
    ~stop:Eio.Buf_read.at_end_of_input
    Eio.Buf_read.any_char
    buf_read
  |> Seq.iter (fun char ->
    if !at_line_start then output_string stderr "[stdout] ";
    output_char stderr char;
    flush stderr;
    Buffer.add_char captured char;
    at_line_start := char = '\n');
  Buffer.contents captured
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
   run_cmd ~env [ "printf"; "%s\n"; "hello there" ] |> display_command_result;
   Printf.eprintf "command that prints to stderr:\n";
   run_cmd ~env [ "ls"; "./this-path-does-not-exist" ])
  |> display_command_result;
  [%expect
    {|
    command that prints to stdout:
    [stdout] hello there
    returned: Ok hello there

    command that prints to stderr:
    [stderr] ls: cannot access './this-path-does-not-exist': No such file or directory
    returned: Error process exited with code 2
    |}]
;;

let%expect_test "run_cmd" =
  let display_command_result result =
    match result with
    | Ok returned -> Printf.eprintf "returned: Ok %s\n" returned
    | Error returned -> Printf.eprintf "returned: Error %s\n" returned
  in
  (Eio_main.run
   @@ fun env ->
   Printf.eprintf "command that prints to stdout:\n";
   run_cmd ~env [ "printf"; "%s\n"; "hello there" ] |> display_command_result;
   Printf.eprintf "command that prints to stderr:\n";
   run_cmd ~env [ "ls"; "./this-path-does-not-exist" ])
  |> display_command_result;
  [%expect
    {|
    command that prints to stdout:
    [stdout] hello there
    returned: Ok hello there

    command that prints to stderr:
    [stderr] ls: cannot access './this-path-does-not-exist': No such file or directory
    returned: Error process exited with code 2
    |}]
;;

let remote_cmd ~env vps_host remote_cmd =
  run_cmd ~env [ "ssh"; vps_host; remote_cmd ]
;;

let path_exists p = Sys.file_exists p

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
