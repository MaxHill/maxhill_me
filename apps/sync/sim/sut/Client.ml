open Eio.Std
open Ppx_yojson_conv_lib.Yojson_conv.Primitives

let src = Logs.Src.create "simulator.client"
let incoming_size = 100

module Log = (val Logs.src_log src : Logs.LOG)

let ( let* ) = Result.bind

type outgoing =
  | Create_user_msg of { key : string; name : string }
  | Query_user_msg
  | Create_post_msg of { key : string; title : string }
  | Query_post_msg
  | Send_sync_request_msg
  | Receive_sync_response_msg of string
  | Close_msg
[@@deriving yojson]

type random_actions =
  | Create_user_action
  | Query_user_action
  | Create_post_action
  | Query_post_action
  | Send_sync_request_action

let actions : random_actions list =
  [
    Create_user_action;
    Send_sync_request_action;
    Query_user_action;
    Query_post_action;
    Create_post_action;
  ]

let action_to_string : random_actions -> string = function
  | Create_user_action -> "Create_user"
  | Query_user_action -> "Query_user"
  | Create_post_action -> "Create_post"
  | Query_post_action -> "Query_post"
  | Send_sync_request_action -> "Send_sync_request"

let outgoing_of_action frng (action : random_actions) =
  match action with
  | Create_user_action ->
      let* name = FRNG.take_string frng ~size:10 in
      let* key = FRNG.take_string frng ~size:10 in
      Ok (Create_user_msg { key; name })
  | Query_user_action -> Ok Query_user_msg
  | Create_post_action ->
      let* title = FRNG.take_string frng ~size:10 in
      let* key = FRNG.take_string frng ~size:10 in
      Ok (Create_post_msg { key; title })
  | Query_post_action -> Ok Query_post_msg
  | Send_sync_request_action -> Ok Send_sync_request_msg

type incoming = Ack | Sync_request of Sync.Sync_engine.sync_request

let incoming_of_yojson = function
  | `List [ `String "Ack" ] -> Ack
  | `List [ `String "SyncRequest"; payload ] -> (
      match
        Sync.Sync_engine.decode_sync_request (Yojson.Safe.to_string payload)
      with
      | Ok req -> Sync_request req
      | Error msg ->
          Ppx_yojson_conv_lib.Yojson_conv.of_yojson_error "incoming_of_yojson"
            (`String msg))
  | json ->
      Ppx_yojson_conv_lib.Yojson_conv.of_yojson_error "incoming_of_yojson" json

type t = {
  inbox : incoming Eio.Stream.t;
  send : outgoing -> unit;
  wait_for_exit : unit -> [ `Exited of int | `Signaled of int ];
  force_close : unit -> unit;
}

let rec spawn ~sw ~env ~cmd : t =
  let mgr = Eio.Stdenv.process_mgr env in

  (* OCaml writes to TS stdin *)
  let stdin_r, stdin_w = Eio.Process.pipe ~sw mgr in
  (* OCaml reads TS stdout (messages) *)
  let stdout_r, stdout_w = Eio.Process.pipe ~sw mgr in
  (* OCaml reads TS stderr (logs) *)
  let stderr_r, stderr_w = Eio.Process.pipe ~sw mgr in

  let proc =
    Eio.Process.spawn mgr ~sw ~stdin:stdin_r ~stdout:stdout_w ~stderr:stderr_w
      cmd
  in

  (* Close parent-side FDs that are only for the child side of the pipes. *)
  Eio.Flow.close stdin_r;
  Eio.Flow.close stdout_w;
  Eio.Flow.close stderr_w;

  let inbox = Eio.Stream.create incoming_size in
  let exit_p, exit_r = Eio.Promise.create () in
  let stderr_ring : string Queue.t = Queue.create () in

  Fiber.fork ~sw (handle_stdout stdout_r inbox);
  Fiber.fork ~sw (handle_stderr stderr_r stderr_ring);
  Fiber.fork ~sw (fun () ->
      let status = Eio.Process.await proc in
      Eio.Promise.resolve exit_r status;
      match status with
      | `Exited 0 -> Log.debug (fun m -> m "TS process closed (exit 0)")
      | `Exited code ->
          let lines =
            Queue.to_seq stderr_ring |> List.of_seq |> String.concat "\n"
          in
          failwith
            (Printf.sprintf
               "TS process exited unexpectedly (code %d)\n\
                Last TS stderr lines:\n\
                %s"
               code lines)
      | `Signaled signal ->
          let lines =
            Queue.to_seq stderr_ring |> List.of_seq |> String.concat "\n"
          in
          failwith
            (Printf.sprintf
               "TS process terminated by signal %d\nLast TS stderr lines:\n%s"
               signal lines));

  let wait_for_exit () = Eio.Promise.await exit_p in
  let force_close () = Eio.Process.signal proc Sys.sigkill in

  { inbox; send = send stdin_w; wait_for_exit; force_close }

and send stdin_w msg =
  let out = Yojson.Safe.to_string (yojson_of_outgoing msg) in

  Log.debug (fun m -> m " OCAML->TS: %s" out);
  Eio.Flow.copy_string (out ^ "\n") stdin_w

and handle_stderr stderr_r stderr_ring () =
  let buf = Eio.Buf_read.of_flow stderr_r ~max_size:max_int in
  let push_ring line =
    Queue.add line stderr_ring;
    if Queue.length stderr_ring > 100 then ignore (Queue.take stderr_ring)
  in
  try
    while true do
      let line = Eio.Buf_read.line buf in
      push_ring line;
      Log.debug (fun m -> m " TS STDERR: %s" line)
    done
  with End_of_file -> ()

and handle_stdout stdout_r messages () =
  let buf = Eio.Buf_read.of_flow stdout_r ~max_size:max_int in
  try
    while true do
      let line = Eio.Buf_read.line buf in
      let incoming = line |> Yojson.Safe.from_string |> incoming_of_yojson in
      assert (Eio.Stream.length messages < incoming_size);
      Log.debug (fun m -> m " TS->OCAML: %s" line);
      Eio.Stream.add messages incoming
    done
  with
  | End_of_file -> Log.debug (fun m -> m " TS STDOUT: closed")
  | Yojson.Json_error msg as exn ->
      Log.debug (fun m -> m " json parse error: %s" msg);
      raise exn
  | Ppx_yojson_conv_lib.Yojson_conv.Of_yojson_error (exn, _json) ->
      Log.debug (fun m -> m " decode error: %s" (Printexc.to_string exn));
      raise exn
  | exn ->
      Log.debug (fun m -> m " other error: %s" (Printexc.to_string exn));
      raise exn
