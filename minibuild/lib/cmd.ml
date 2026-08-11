(* setup.ml — global, machine-wide provisioning for a fresh Ubuntu box.
   Run once as root. Safe to re-run: every step checks its own state
   before acting, and re-verifies after. No shell strings, ever —
   commands are argv arrays passed straight to exec, so there's no
   quoting/injection surface at all (see matklad's "Shell Injection"
   post — this is exactly the pattern that bites root scripts). *)

(* Run argv directly. No /bin/sh -c anywhere in this file. *)
let rec run_cmd (argv : string array) : (string, string) result =
  let stdout_read, stdout_write = Unix.pipe () in
  Unix.set_close_on_exec stdout_read;
  let pid =
    Unix.create_process argv.(0) argv Unix.stdin stdout_write Unix.stderr
  in
  Unix.close stdout_write;
  let res = read_all stdout_read in
  Unix.close stdout_read;
  match Unix.waitpid [] pid with
  | _, Unix.WEXITED 0 -> Ok res
  | _, Unix.WEXITED n -> Error (Printf.sprintf "%s exited %d" argv.(0) n)
  | _, _ -> Error (Printf.sprintf "%s killed/stopped" argv.(0))

and read_all fd =
  let buffer = Bytes.create 4096 in
  let result = Buffer.create 4096 in
  let rec loop () =
    match Unix.read fd buffer 0 (Bytes.length buffer) with
    | 0 -> Buffer.contents result
    | n ->
      Buffer.add_subbytes result buffer 0 n;
      loop ()
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

(* ---------- steps ---------- *)

(* let%expect_test "create_file_example" = *)
(*   let create_file = *)
(*     { name = "create a temporary file" *)
(*     ; check = *)
(*         (fun () -> *)
(*           match run_cmd [| "cat"; "/tmp/testfile.txt" |] with *)
(*           | Ok _ -> true *)
(*           | Error _ -> false) *)
(*     ; apply = *)
(*         (fun () -> *)
(*           let* () = run_cmd [| "touch"; "/tmp/testfile.txt" |] in *)
(*           let ( let* ) = Result.bind in *)
(*           let* () = run_cmd [| "echo"; "'test'"; ">>"; "/tmp/testfile.txt" |] in *)
(*           run_cmd [| "cat"; "/tmp/testfile.txt" |]) *)
(*     } *)
(*   in *)
(*   let _ = *)
(*     match create_file.apply () with *)
(*     | Ok () -> print_endline "Ok" *)
(*     | Error e -> print_endline e *)
(*   in *)
(*   [%expect {| Hello, World! |}] *)
(* ;; *)
