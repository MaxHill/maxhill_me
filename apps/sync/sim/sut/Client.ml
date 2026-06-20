open Eio.Std
open Ppx_yojson_conv_lib.Yojson_conv.Primitives

let src = Logs.Src.create "simulator.client"

module Log = (val Logs.src_log src : Logs.LOG)

type outgoing = Ping of { step : int } | Close [@@deriving yojson]
type incoming = Pong [@@deriving yojson]

type t = {
  inbox : incoming Eio.Stream.t;
  send : outgoing -> unit;
  wait_for_exit : unit -> [ `Exited of int | `Signaled of int ];
}

let rec spawn ~sw ~env ~cmd : t =
  let mgr = Eio.Stdenv.process_mgr env in

  (* OCaml writes to TS stdin *)
  let stdin_r, stdin_w = Eio.Process.pipe ~sw mgr in
  (* OCaml reads TS stdout (requests) *)
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

  let inbox = Eio.Stream.create 100 in
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

and handle_stdout stdout_r requests () =
  let buf = Eio.Buf_read.of_flow stdout_r ~max_size:max_int in
  try
    while true do
      let incoming =
        Eio.Buf_read.line buf |> Yojson.Safe.from_string |> incoming_of_yojson
      in
      Log.debug (fun m ->
          m " TS->OCAML: %s"
            (Yojson.Safe.pretty_to_string (yojson_of_incoming incoming)));
      Eio.Stream.add requests incoming
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
