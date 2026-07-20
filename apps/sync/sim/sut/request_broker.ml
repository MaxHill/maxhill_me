open Shared

let delay_request_queue : Sync.Sync_engine.sync_request list = []
let delay_response_queue : Sync.Sync_engine.sync_response list = []

(* Todo:
      - Maybe drop request
      - Maybe drop response
      - Maybe delay request
      - Maybe delay response
      - Maybe corrupt request
      - Maybe corrupt response
      *)
let handle_sync_request ~(client : Client.t) ~(world : world)
    (request : Sync.Sync_engine.sync_request) =
  let response =
    match
      Sync.Sync_engine.process_sync_request_with_connection world.db_conn
        ~db_name:world.tenant_key request
    with
    | Error err -> failwith (Sync.Sync_engine.sync_error_to_string err)
    | Ok response -> response
  in

  let seen_from_response : Client.operation_record list =
    List.map
      (fun (op : Sync.Sync_engine.crdt_operation) ->
        ({ Client.key = op.row_key; Client.table = op.table }
          : Client.operation_record))
      response.operations
  in
  client.seen_operations <- client.seen_operations @ seen_from_response;

  client.send
    (Client.Receive_sync_response_msg
       (Sync.Sync_engine.encode_sync_response response));

  wait_for_response ~client ~world ~action:"Receive_sync_response"
  |> Result.map (function
    | Client.Ack -> ()
    | Client.Sync_request _ ->
        failwith "protocol violation: expected Ack after Receive_sync_response")
