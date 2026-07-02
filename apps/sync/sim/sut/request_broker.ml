open Shared

let delay_request_queue : Sync.Sync_engine.sync_request Queue.t =
  Queue.create ()

let delay_response_queue : Sync.Sync_engine.sync_response Queue.t =
  Queue.create ()

(* Todo:
      - Maybe drop request
      - Maybe drop response
      - Maybe delay request
      - Maybe delay response
      - Maybe corrupt request
      - Maybe corrupt response
      *)
let handle_sync_request ~(world : world) request =
  let response =
    match Sync.Sync_engine.process_sync_request_with_connection world.db_conn request with
    | Error err -> failwith (Sync.Sync_engine.sync_error_to_string err)
    | Ok response -> response
  in
  world.client.send
    (Receive_sync_response_msg (Sync.Sync_engine.encode_sync_response response));

  wait_for_response ~world ~action:"Receive_sync_response"
  |> Result.map (function
    | Client.Ack -> ()
    | Client.Sync_request _ ->
        failwith "protocol violation: expected Ack after Receive_sync_response")
