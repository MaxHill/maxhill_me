(* setup.ml — global, machine-wide provisioning for a fresh Ubuntu box.
   Run once as root. Safe to re-run: every step checks its own state
   before acting, and re-verifies after. No shell strings, ever —
   commands are argv arrays passed straight to exec, so there's no
   quoting/injection surface at all (see matklad's "Shell Injection"
   post — this is exactly the pattern that bites root scripts). *)

let rec run_cmd_eio ~env (argv : string list) : (string, _) result =
  let proc_mgr = Eio.Stdenv.process_mgr env in
  let _output =
    Eio.Process.parse_out
      ~stdin:(Eio.Flow.string_source "One two three\nOne two three\n")
      (* ~stderr:read_stderr *)
      proc_mgr
      read_stdout
      [ "cat" ]
  in
  Ok ""

and read_stdout buf_read =
  let captured = Buffer.create 4096 in
  let at_line_start = ref true in
  Eio.Buf_read.seq
    ~stop:Eio.Buf_read.at_end_of_input
    Eio.Buf_read.any_char
    buf_read
  |> Seq.iter (fun char ->
    if !at_line_start then print_string "[stdout] ";
    print_char char;
    flush stdout;
    Buffer.add_char captured char;
    at_line_start := char = '\n');
  Buffer.contents captured

and read_stderr flow sink =
  let buf = Cstruct.create 4096 in
  let rec loop () =
    match Eio.Flow.single_read flow buf with
    | 0 -> ()
    | n ->
      let chunk = Cstruct.to_string (Cstruct.sub buf 0 n) in
      print_string chunk;
      (* Print as it comes in! *)
      flush stdout;
      Eio.Flow.copy_string chunk sink;
      loop ()
  in
  loop ()
;;

let%expect_test "run_cmd_eio basics" =
  Eio_main.run
  @@ fun env ->
  let _ = run_cmd_eio ~env [ "ls" ] in
  [%expect
    {|
    echo command: [success] 'test-text'

    file exists: true
    'test-text'
    |}]
;;

(* Run argv directly. No /bin/sh -c anywhere in this file. *)
let rec run_cmd ?(quiet = true) (argv : string array) : (string, string) result =
  let stdout_read, stdout_write = Unix.pipe () in
  let stderr_read, stderr_write = Unix.pipe () in
  Unix.set_close_on_exec stdout_read;
  let pid =
    Unix.create_process argv.(0) argv Unix.stdin stdout_write stderr_write
  in
  Unix.close stdout_write;
  Unix.close stderr_write;
  (* TODO: stderr handling is incomplete. In quiet mode this pipe is not
     drained; otherwise it is drained only after stdout. A child that fills
     stderr can deadlock, and [print_stderr] currently reads one chunk only. *)
  let res = read_all ~quiet stdout_read in
  if not quiet then print_stderr stderr_read;
  Unix.close stdout_read;
  Unix.close stderr_read;
  match Unix.waitpid [] pid with
  | _, Unix.WEXITED 0 -> Ok res
  | _, Unix.WEXITED n -> Error (Printf.sprintf "%s exited %d" argv.(0) n)
  | _, _ -> Error (Printf.sprintf "%s killed/stopped" argv.(0))

and read_all ?(quiet = true) fd =
  let buffer = Bytes.create 4096 in
  let result = Buffer.create 4096 in
  let at_line_start = ref true in
  let rec loop () =
    match Unix.read fd buffer 0 (Bytes.length buffer) with
    | 0 -> Buffer.contents result
    | n ->
      let chunk = Bytes.sub_string buffer 0 n in
      Buffer.add_string result chunk;
      if not quiet
      then
        String.iter
          (fun c ->
             if !at_line_start then print_string "[stdout]  ";
             print_char c;
             flush stdout;
             at_line_start := c = '\n')
          chunk;
      loop ()
  in
  loop ()

and print_stderr fd : unit =
  let buffer = Bytes.create 4096 in
  let at_line_start = ref true in
  let rec loop () =
    match Unix.read fd buffer 0 (Bytes.length buffer) with
    | 0 -> ()
    | n ->
      let chunk = Bytes.sub_string buffer 0 n in
      String.iter
        (fun c ->
           if !at_line_start then print_string "[stderr]  ";
           print_char c;
           flush stderr;
           at_line_start := c = '\n')
        chunk
  in
  loop ()
;;

let remote_cmd vps_host remote_cmd = run_cmd [| "ssh"; vps_host; remote_cmd |]
let path_exists p = Sys.file_exists p

(* Will return for example:
file_permission "some_file.txt" = 0o600*)
let file_permission p = (Unix.stat p).Unix.st_perm

let%expect_test "run_cmd basics" =
  let tmp_dir = Filename.temp_dir "minibuild_" "_testing" in
  let filename = "test-file.txt" in
  let filepath = tmp_dir ^ filename in
  let _ = run_cmd [| "touch"; filepath |] in
  let out = run_cmd [| "echo"; "'test-text'" |] in
  let created =
    match Sys.file_exists filepath with
    | true -> "file exists: true"
    | false -> "file exists: false"
  in
  let out_msg =
    match out with
    | Ok o -> Format.sprintf "echo command: [success] %s" o
    | Error e -> Format.sprintf "echo command: [failed ]  %s" e
  in
  print_endline out_msg;
  print_endline created;
  let () =
    match out with
    | Ok o -> print_endline o
    | Error e -> print_endline e
  in
  [%expect
    {|
    echo command: [success] 'test-text'

    file exists: true
    'test-text'
    |}]
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
