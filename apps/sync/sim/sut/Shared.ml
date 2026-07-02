(* ------------------------------------------------------------------------ *)
(* Types *)
(* ------------------------------------------------------------------------  *)
type connection = (module Caqti_eio.CONNECTION)

type world = {
  mutable client : Client.t;
  frng : FRNG.t;
  mutable step_n : int;
  db_conn : connection;
  clock : [ `Clock of float ] Eio.Resource.t;
  action_timeout : float;
  mutable last_count_operations : int option;
  mutable last_max_server_version : int64 option;
}

(* ------------------------------------------------------------------------ *)
(* Utils *)
(* ------------------------------------------------------------------------  *)
let ( let* ) = Result.bind

let wait_for_response ~world ~action =
  Eio.Time.with_timeout world.clock world.action_timeout (fun () ->
      Eio.Stream.take world.client.inbox |> fun msg -> Result.Ok msg)
  |> Result.map_error (fun _e ->
      failwith
        (Printf.sprintf
           "SIM_TIMEOUT: step=%d action=%s timeout=%.3fs \
            waiting_for_client_message"
           world.step_n action world.action_timeout))
