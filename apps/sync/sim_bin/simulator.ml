open Cmdliner

let src = Logs.Src.create "simulator.main"

module Log = (val Logs.src_log src : Logs.LOG)

let parse_log_level = function
  | None -> Some Logs.Info
  | Some value -> (
      match Logs.level_of_string (String.lowercase_ascii value) with
      | Ok level -> level
      | Error (`Msg msg) -> failwith ("invalid --log-level: " ^ msg))

let configure_logs log_level =
  let level = parse_log_level log_level in
  Logs.set_reporter (Logs_fmt.reporter ());
  Logs.set_level ~all:true level

let log_level_arg =
  let doc = "Log-level verbosity." in
  Arg.(
    value
    & opt (some string) None
    & info [ "log-level"; "l" ] ~docv:"LOG LEVEL" ~doc)

(*  ------------------------------------------------------------------------ *)
(* Run once                                                                  *)
(* ------------------------------------------------------------------------  *)
let replay_handler log_level seed size =
  configure_logs log_level;
  let entropy = Sync_simulator.Driver.entropy_of_seed ~seed ~size in
  let result =
    Sync_simulator.Driver.run_once
      ~sut_path:"./_build/default/sim_bin/simulator_sut.exe" ~entropy ~log_level
  in
  match result with
  | Sync_simulator.Driver.Fail ->
      Logs.app (fun m -> m "Fail size=%d seed=%d" size seed)
  | Sync_simulator.Driver.Pass ->
      Logs.app (fun m -> m "Pass size=%d seed=%d" size seed)

let replay_cmd =
  let seed_arg =
    let doc = "Seed to replay." in
    Arg.(required & opt (some int) None & info [ "seed" ] ~docv:"SEED" ~doc)
  in
  let size_arg =
    let doc = "Size to replay." in
    Arg.(value & opt int 4096 & info [ "size" ] ~docv:"SIZE" ~doc)
  in

  let info = Cmd.info "replay" ~doc:"Replay a known seed" in
  Cmd.v info Term.(const replay_handler $ log_level_arg $ seed_arg $ size_arg)

(*  ------------------------------------------------------------------------ *)
(*  Run search                                                             *)
(* ------------------------------------------------------------------------  *)
let search_handler log_level attempts size_max =
  configure_logs log_level;
  let result =
    Sync_simulator.Driver.search
      ~sut_path:"./_build/default/sim_bin/simulator_sut.exe" ~size_max ~attempts
      ~log_level
  in
  match result with
  | Search_fail r ->
      Logs.app (fun m -> m "minimized size=%d seed=%d" r.size r.seed)
  | Search_pass -> Logs.app (fun m -> m "ok (%d attempts per size)" attempts)

let search_cmd =
  let attempts_arg =
    let doc = "How many attempts." in
    Arg.(value & opt int 100 & info [ "attempts" ] ~docv:"ATTEMPTS" ~doc)
  in
  let size_max_arg =
    let doc = "Biggest entropy to test." in
    Arg.(value & opt int 4096 & info [ "size-max" ] ~docv:"SIZE_MAX" ~doc)
  in
  let info = Cmd.info "search" ~doc:"Run simulator in search mode" in
  Cmd.v info
    Term.(const search_handler $ log_level_arg $ attempts_arg $ size_max_arg)

(*  ------------------------------------------------------------------------ *)
(*  init                                                                     *)
(* ------------------------------------------------------------------------  *)
let () =
  let main_info = Cmd.info "prg" ~version:"0.1.0" ~doc:"Example CLI" in
  exit (Cmd.eval (Cmd.group main_info [ replay_cmd; search_cmd ]))
