open Eio.Std
open Ppx_yojson_conv_lib.Yojson_conv.Primitives

let src = Logs.Src.create "simulator.client"
let incoming_size = 100

module Log = (val Logs.src_log src : Logs.LOG)

type outgoing =
  | Create_user of { key : string; name : string }
  | Create_post of { key : string; title : string }
  | Close
[@@deriving yojson]

type incoming = Pong | Sync_request of Sync.Sync_engine.sync_request

let incoming_of_yojson = function
  | `List [ `String "Pong" ] -> Pong
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

  Fiber.fork ~sw (handle_stdout stdout_r inbox);
  Fiber.fork ~sw (handle_stderr stderr_r);
  Fiber.fork ~sw (fun () ->
      let status = Eio.Process.await proc in
      Eio.Promise.resolve exit_r status;
      match status with
      | `Exited 0 -> Log.debug (fun m -> m "TS process closed (exit 0)")
      | `Exited code ->
          failwith
            (Printf.sprintf "TS process exited unexpectedly (code %d)" code)
      | `Signaled signal ->
          failwith (Printf.sprintf "TS process terminated by signal %d" signal));

  let wait_for_exit () = Eio.Promise.await exit_p in

  { inbox; send = send stdin_w; wait_for_exit }

and send stdin_w msg =
  let out = Yojson.Safe.to_string (yojson_of_outgoing msg) in

  Log.debug (fun m -> m " OCAML->TS: %s" out);
  Eio.Flow.copy_string (out ^ "\n") stdin_w

and handle_stderr stderr_r () =
  let buf = Eio.Buf_read.of_flow stderr_r ~max_size:max_int in
  try
    while true do
      let line = Eio.Buf_read.line buf in
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
