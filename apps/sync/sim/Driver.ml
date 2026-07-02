let src = Logs.Src.create "simulator.main"

module Log = (val Logs.src_log src : Logs.LOG)

let () = Random.self_init ()

type outcome = Pass | Fail
type multi_outcome = All_pass | Found_fail of int (* the failing seed *)

let write_all fd s =
  let len = String.length s in
  let rec loop off =
    if off >= len then ()
    else
      let wrote = Unix.write_substring fd s off (len - off) in
      if wrote = 0 then failwith "write_all: wrote 0 bytes"
      else loop (off + wrote)
  in
  loop 0

let rec run_once ~sut_path ~entropy ~log_level : outcome =
  let stdin_read, stdin_write = Unix.pipe () in
  Unix.set_close_on_exec stdin_write;
  let argv = [| sut_path |] in
  let env = env_with_log_level ~log_level in
  let pid =
    Unix.create_process_env sut_path argv env stdin_read Unix.stdout Unix.stderr
  in
  Unix.close stdin_read;
  write_all stdin_write entropy;
  Unix.close stdin_write;
  let _, status = Unix.waitpid [] pid in
  match status with Unix.WEXITED 0 -> Pass | _ -> Fail

and env_with_log_level ~log_level =
  let base = Array.to_list (Unix.environment ()) in
  let base =
    List.filter
      (fun entry -> not (String.starts_with ~prefix:"SIM_LOG_LEVEL=" entry))
      base
  in
  let with_level =
    match log_level with
    | None -> base
    | Some level -> ("SIM_LOG_LEVEL=" ^ level) :: base
  in
  Array.of_list with_level

let entropy_of_seed ~seed ~size =
  let state = Random.State.make [| seed |] in
  let buf = Bytes.create size in
  for i = 0 to size - 1 do
    Bytes.set_uint8 buf i (Random.State.int state 256)
  done;
  Bytes.unsafe_to_string buf

let fresh_seed = Random.bits
let stderr_is_tty = Unix.isatty (Unix.descr_of_out_channel stderr)

let print_run_header ~size ~seed ~attempt =
  if stderr_is_tty then (
    (* Replace previous run's 2 lines: header + progress line. *)
    if attempt > 0 then Printf.eprintf "\027[2A\027[2K\027[1B\027[2K\027[1A";
    Printf.eprintf "size=%d seed=%d attempt=%d\n" size seed (attempt + 1))
  else Printf.eprintf "size=%d seed=%d attempt=%d\n" size seed attempt;
  flush stderr

let run_multiple ~sut_path ~size ~attempts ~log_level : multi_outcome =
  let rec loop = function
    | attempt when attempt = attempts -> All_pass
    | attempt -> (
        let seed = fresh_seed () in
        let entropy = entropy_of_seed ~seed ~size in
        print_run_header ~size ~seed ~attempt;
        match run_once ~sut_path ~entropy ~log_level with
        | Pass -> loop (attempt + 1)
        | Fail -> Found_fail seed)
  in
  loop 0

(* ------------------------------------------------------------------------ *)
(* Search                                                                   *)
(* ------------------------------------------------------------------------ *)

type search_outcome = Search_pass | Search_fail of { size : int; seed : int }

let search ~sut_path ~attempts ~size_max ~log_level : search_outcome =
  let rec loop ~iter ~size ~step ~pass ~found =
    if iter >= 1024 then failwith "safety counter"
    else if step = 0 then found
    else
      let size_next = if pass then size + step else max 0 (size - step) in
      if size_next > size_max then found
      else
        let outcome =
          run_multiple ~sut_path ~size:size_next ~attempts ~log_level
        in
        let pass_next, found =
          match outcome with
          | All_pass ->
              Logs.info (fun m -> m "pass size=%d" size_next);
              (true, found)
          | Found_fail seed ->
              Logs.err (fun m -> m "fail size=%d seed=%d" size_next seed);
              (false, Some (size_next, seed))
        in
        let step_next =
          if pass = pass_next then if pass then step * 2 else step else step / 2
        in
        let size_new, pass_new =
          if pass || not pass_next then (size_next, pass_next) else (size, pass)
        in
        loop ~iter:(iter + 1) ~size:size_new ~step:step_next ~pass:pass_new
          ~found
  in
  let result = loop ~iter:0 ~size:16 ~step:16 ~pass:true ~found:None in
  match result with
  | None -> Search_pass
  | Some (size, seed) -> Search_fail { size; seed }
