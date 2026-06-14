let () = Random.self_init ()

type outcome = Pass | Fail
type multi_outcome = All_pass | Found_fail of int (* the failing seed *)

let run_once ~sut_path ~entropy : outcome =
  let stdin_read, stdin_write = Unix.pipe () in
  Unix.set_close_on_exec stdin_write;
  let pid =
    Unix.create_process sut_path [| sut_path |] stdin_read Unix.stdout
      Unix.stderr
  in
  Unix.close stdin_read;
  let n = String.length entropy in
  let _ = Unix.write_substring stdin_write entropy 0 n in
  Unix.close stdin_write;
  let _, status = Unix.waitpid [] pid in
  match status with Unix.WEXITED 0 -> Pass | _ -> Fail

let entropy_of_seed ~seed ~size =
  let state = Random.State.make [| seed |] in
  let buf = Bytes.create size in
  for i = 0 to size - 1 do
    Bytes.set_uint8 buf i (Random.State.int state 256)
  done;
  Bytes.unsafe_to_string buf

let fresh_seed = Random.bits

let run_multiple ~sut_path ~size ~attempts : multi_outcome =
  let rec loop = function
    | attempt when attempt = attempts -> All_pass
    | attempt -> (
        let seed = fresh_seed () in
        let entropy = entropy_of_seed ~seed ~size in
        match run_once ~sut_path ~entropy with
        | Pass -> loop (attempt + 1)
        | Fail -> Found_fail seed)
  in
  loop 0

(* ------------------------------------------------------------------------ *)
(* Search                                                                   *)
(* ------------------------------------------------------------------------ *)

type search_outcome = Search_pass | Search_fail of { size : int; seed : int }

let search ~sut_path ~attempts ~size_max : search_outcome =
  let rec loop ~iter ~size ~step ~pass ~found =
    if iter >= 1024 then failwith "safety counter"
    else if step = 0 then found
    else
      let size_next = if pass then size + step else max 0 (size - step) in
      if size_next > size_max then found
      else
        let outcome = run_multiple ~sut_path ~size:size_next ~attempts in
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
