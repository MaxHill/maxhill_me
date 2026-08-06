open Eio.Std
open Ppx_yojson_conv_lib.Yojson_conv.Primitives

let src = Logs.Src.create "simulator.client"
let incoming_size = 100

module Log = (val Logs.src_log src : Logs.LOG)

let ( let* ) = Result.bind

type incoming = Ack | Sync_request of Sync.Sync_engine.sync_request
type query_target = [ `users | `posts | `user_age_index ] [@@deriving yojson]

type table_target = [ `users | `posts ] [@@deriving yojson]

type outgoing =
  | Create_user_msg of { key : string; name : string; age : int }
  | Query_msg of query_target
  | Create_post_msg of { key : string; title : string }
  | Delete_row_msg of { table : table_target; key : string }
  | Update_user_row_msg of { key : string; name : string; age : int }
  | Update_post_row_msg of { key : string; title : string }
  | Update_user_name_field_msg of { key : string; name : string }
  | Update_user_age_field_msg of { key : string; age : int }
  | Update_post_title_field_msg of { key : string; title : string }
  | Send_sync_request_msg
  | Receive_sync_response_msg of string
  | Close_msg
[@@deriving yojson]

type operation_record = { key : string; table : string }

type t = {
  inbox : incoming Eio.Stream.t;
  send : outgoing -> unit;
  wait_for_exit : unit -> [ `Exited of int | `Signaled of int ];
  force_close : unit -> unit;
  mutable seen_operations : operation_record list;
}

type random_actions =
  | Create_user_action
  | Query_users_action
  | Create_post_action
  | Query_posts_action
  | Query_user_age_index_action
  | Delete_row_action
  | Update_row_action
  | Update_field_action
  | Send_sync_request_action

(* Take actions on clients. *)
let actions : random_actions list =
  [
    Create_user_action;
    Send_sync_request_action;
    Query_users_action;
    Query_posts_action;
    Query_user_age_index_action;
    Create_post_action;
    Delete_row_action;
    Update_row_action;
    Update_field_action;
  ]

let action_to_string : random_actions -> string = function
  | Create_user_action -> "Create_user"
  | Query_users_action -> "Query_users"
  | Create_post_action -> "Create_post"
  | Query_posts_action -> "Query_posts"
  | Query_user_age_index_action -> "Query_user_age_index"
  | Delete_row_action -> "Delete_row"
  | Update_row_action -> "Update_row"
  | Update_field_action -> "Update_field"
  | Send_sync_request_action -> "Send_sync_request"

let pick_seen_operation frng (client : t) ~(tables : string list) =
  let candidates =
    List.filter
      (fun (op : operation_record) -> List.mem op.table tables)
      client.seen_operations
  in
  match candidates with
  | [] -> Ok None
  | _ ->
      let* idx = FRNG.take_index frng candidates in
      Ok (Some (List.nth candidates idx))

let outgoing_of_action frng (client : t) (action : random_actions) =
  match action with
  | Create_user_action ->
      let* name = FRNG.take_string frng ~size:10 in
      let* key = FRNG.take_string frng ~size:10 in
      let* age = FRNG.take_range_inclusive frng ~min:0 ~max:120 in
      client.seen_operations <-
        { key; table = "users" } :: client.seen_operations;
      Ok (Create_user_msg { key; name; age })
  | Query_users_action -> Ok (Query_msg `users)
  | Create_post_action ->
      let* title = FRNG.take_string frng ~size:10 in
      let* key = FRNG.take_string frng ~size:10 in
      client.seen_operations <-
        { key; table = "posts" } :: client.seen_operations;
      Ok (Create_post_msg { key; title })
  | Query_posts_action -> Ok (Query_msg `posts)
  | Query_user_age_index_action -> Ok (Query_msg `user_age_index)
  | Delete_row_action ->
      let* selected =
        pick_seen_operation frng client ~tables:[ "users"; "posts" ]
      in
      (match selected with
      | None -> Ok Send_sync_request_msg
      | Some op ->
          if op.table = "users" then
            Ok (Delete_row_msg { table = `users; key = op.key })
          else Ok (Delete_row_msg { table = `posts; key = op.key }))
  | Update_row_action ->
      let* selected =
        pick_seen_operation frng client ~tables:[ "users"; "posts" ]
      in
      (match selected with
      | None -> Ok Send_sync_request_msg
      | Some op when op.table = "users" ->
          let* name = FRNG.take_string frng ~size:10 in
          let* age = FRNG.take_range_inclusive frng ~min:0 ~max:120 in
          Ok (Update_user_row_msg { key = op.key; name; age })
      | Some op ->
          let* title = FRNG.take_string frng ~size:10 in
          Ok (Update_post_row_msg { key = op.key; title }))
  | Update_field_action ->
      let* selected =
        pick_seen_operation frng client ~tables:[ "users"; "posts" ]
      in
      (match selected with
      | None -> Ok Send_sync_request_msg
      | Some op when op.table = "users" ->
          let* update_age = FRNG.take_bool frng in
          if update_age then
            let* age = FRNG.take_range_inclusive frng ~min:0 ~max:120 in
            Ok (Update_user_age_field_msg { key = op.key; age })
          else
            let* name = FRNG.take_string frng ~size:10 in
            Ok (Update_user_name_field_msg { key = op.key; name })
      | Some op ->
          let* title = FRNG.take_string frng ~size:10 in
          Ok (Update_post_title_field_msg { key = op.key; title }))
  | Send_sync_request_action -> Ok Send_sync_request_msg

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

  {
    inbox;
    send = send stdin_w;
    wait_for_exit;
    force_close;
    seen_operations = [];
  }

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
