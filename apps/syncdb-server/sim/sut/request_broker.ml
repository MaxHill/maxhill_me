open Shared

type delayed_request = {
  client : Client.t;
  request : Sync.Sync_engine.sync_request;
  remaining_ticks : int;
}

type delayed_response = {
  client : Client.t;
  response : Sync.Sync_engine.sync_response;
  remaining_ticks : int;
}

type network_action = Pass | Drop | Delay | Corrupt

type broker_state = {
  mutable pending_requests : delayed_request list;
  mutable pending_responses : delayed_response list;
}

let broker_state = { pending_requests = []; pending_responses = [] }

let choose_delay_ticks ~(world : world) =
  FRNG.take_range_inclusive world.frng ~min:1 ~max:20

let choose_request_action ~(world : world) :
    (network_action, FRNG.frng_error) result =
  let* action =
    FRNG.weighted_pick world.frng
      [
        (Pass, 60);
        (Delay, 20);
        (Drop, 15);
        (Corrupt, 5);
      ]
  in
  match action with
  | Pass -> Ok Pass
  | Delay ->
      let* _delay_ticks = choose_delay_ticks ~world in
      Ok Delay
  | Drop -> Ok Drop
  | Corrupt -> Ok Corrupt

let choose_response_action ~(world : world) :
    (network_action, FRNG.frng_error) result =
  let* action =
    FRNG.weighted_pick world.frng
      [
        (Pass, 50);
        (Delay, 20);
        (Drop, 20);
        (Corrupt, 10);
      ]
  in
  match action with
  | Pass -> Ok Pass
  | Delay ->
      let* _delay_ticks = choose_delay_ticks ~world in
      Ok Delay
  | Drop -> Ok Drop
  | Corrupt -> Ok Corrupt

let corrupt_request_field ~(world : world)
    (request : Sync.Sync_engine.sync_request) =
  let* field = FRNG.take_range_inclusive world.frng ~min:0 ~max:2 in
  match field with
  | 0 ->
      Ok
        {
          request with
          last_seen_server_version =
            Int64.add request.last_seen_server_version 1L;
        }
  | 1 -> Ok { request with client_id = request.client_id ^ "-corrupt" }
  | _ -> Ok { request with db_name = request.db_name ^ "-corrupt" }

let corrupt_response_field ~(world : world)
    (response : Sync.Sync_engine.sync_response) =
  let* field = FRNG.take_range_inclusive world.frng ~min:0 ~max:2 in
  match field with
  | 0 ->
      Ok
        {
          response with
          base_server_version = Int64.add response.base_server_version 1L;
        }
  | 1 ->
      Ok
        {
          response with
          latest_server_version = Int64.add response.latest_server_version 1L;
        }
  | _ ->
      Ok { response with response_hash = response.response_hash ^ "-corrupt" }

let add_seen_operations_from_response ~(client : Client.t)
    (response : Sync.Sync_engine.sync_response) =
  let seen_from_response : Client.operation_record list =
    List.map
      (fun (op : Sync.Sync_engine.crdt_operation) ->
        ({ Client.key = op.row_key; Client.table = op.table }
          : Client.operation_record))
      response.operations
  in
  client.seen_operations <- client.seen_operations @ seen_from_response

let send_response_to_client ~(client : Client.t) ~(world : world)
    (response : Sync.Sync_engine.sync_response) =
  add_seen_operations_from_response ~client response;
  client.send
    (Client.Receive_sync_response_msg
       (Sync.Sync_engine.encode_sync_response response));

  wait_for_response ~client ~world ~action:"Receive_sync_response"
  |> Result.map (function
    | Client.Ack -> ()
    | Client.Sync_request _ ->
        failwith "protocol violation: expected Ack after Receive_sync_response")

let register_delayed_response ~(client : Client.t)
    ~(response : Sync.Sync_engine.sync_response) ~delay_ticks =
  broker_state.pending_responses <-
    { client; response; remaining_ticks = delay_ticks }
    :: broker_state.pending_responses;
  Ok ()

let register_delayed_request ~(client : Client.t)
    ~(request : Sync.Sync_engine.sync_request) ~delay_ticks =
  broker_state.pending_requests <-
    { client; request; remaining_ticks = delay_ticks }
    :: broker_state.pending_requests;
  Ok ()

let process_request_and_maybe_send_response ~(client : Client.t) ~(world : world)
    (request : Sync.Sync_engine.sync_request) =
  let response =
    match
      Sync.Sync_engine.process_sync_request_with_connection world.db_conn
        ~db_name:world.tenant_key request
    with
    | Error err -> failwith (Sync.Sync_engine.sync_error_to_string err)
    | Ok response -> response
  in

  let* action = choose_response_action ~world in
  match action with
  | Pass -> send_response_to_client ~client ~world response
  | Drop -> Ok ()
  | Delay ->
      let* delay_ticks = choose_delay_ticks ~world in
      register_delayed_response ~client ~response ~delay_ticks
  | Corrupt ->
      let* corrupted_response = corrupt_response_field ~world response in
      send_response_to_client ~client ~world corrupted_response

let process_corrupted_request ~(world : world)
    (request : Sync.Sync_engine.sync_request) =
  let* corrupted_request = corrupt_request_field ~world request in
  match
    Sync.Sync_engine.process_sync_request_with_connection world.db_conn
      ~db_name:world.tenant_key corrupted_request
  with
  | Error Sync.Sync_engine.Request_integrity_failed -> Ok ()
  | Error err -> failwith (Sync.Sync_engine.sync_error_to_string err)
  | Ok _ -> failwith "expected corrupted request to fail request hash validation"

let split_due_requests (pending_requests : delayed_request list) =
  let rec loop (pending : delayed_request list) (ready : delayed_request list) =
    function
    | [] -> (List.rev pending, List.rev ready)
    | (item : delayed_request) :: rest ->
        let remaining_ticks = item.remaining_ticks - 1 in
        if remaining_ticks <= 0 then loop pending (item :: ready) rest
        else loop ({ item with remaining_ticks } :: pending) ready rest
  in
  loop [] [] pending_requests

let split_due_responses (pending_responses : delayed_response list) =
  let rec loop (pending : delayed_response list) (ready : delayed_response list) =
    function
    | [] -> (List.rev pending, List.rev ready)
    | (item : delayed_response) :: rest ->
        let remaining_ticks = item.remaining_ticks - 1 in
        if remaining_ticks <= 0 then loop pending (item :: ready) rest
        else loop ({ item with remaining_ticks } :: pending) ready rest
  in
  loop [] [] pending_responses

let rec flush_request_items ~(world : world) (items : delayed_request list) =
  match items with
  | [] -> Ok ()
  | item :: rest ->
      let* () =
        process_request_and_maybe_send_response ~client:item.client ~world
          item.request
      in
      flush_request_items ~world rest

let rec flush_response_items ~(world : world) (items : delayed_response list) =
  match items with
  | [] -> Ok ()
  | item :: rest ->
      let* () = send_response_to_client ~client:item.client ~world item.response in
      flush_response_items ~world rest

let tick ~(world : world) =
  let pending_requests, ready_requests =
    split_due_requests broker_state.pending_requests
  in
  broker_state.pending_requests <- pending_requests;
  let pending_responses, ready_responses =
    split_due_responses broker_state.pending_responses
  in
  broker_state.pending_responses <- pending_responses;
  let* () = flush_request_items ~world ready_requests in
  flush_response_items ~world ready_responses

let handle_sync_request ~(client : Client.t) ~(world : world)
    (request : Sync.Sync_engine.sync_request) =
  let* action = choose_request_action ~world in
  match action with
  | Pass -> process_request_and_maybe_send_response ~client ~world request
  | Drop -> Ok ()
  | Delay ->
      let* delay_ticks = choose_delay_ticks ~world in
      register_delayed_request ~client ~request ~delay_ticks
  | Corrupt -> process_corrupted_request ~world request
