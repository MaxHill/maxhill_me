(* ------------------------------------------------------------------------ *)
(* Types *)
(* ------------------------------------------------------------------------  *)
type connection = (module Caqti_eio.CONNECTION)
type pool = (connection, Caqti_error.t) Caqti_eio.Pool.t

type world = {
  client : Client.t;
  frng : FRNG.t;
  mutable step_n : int;
  db_pool : pool;
  clock : [ `Clock of float ] Eio.Resource.t;
  action_timeout : float;
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
