let run_eio f = Eio_main.run @@ fun _env -> f ()

let assert_ok = function
  | Ok v -> v
  | Error `At_capacity -> failwith "unexpected At_capacity"

let await_upstream sub =
  match Sync.Event_hub.await sub with
  | Some Sync.Event_hub.Upstream_change -> ()
  | None -> failwith "expected Upstream_change, subscription closed"

let test_subscribe_and_publish_delivers_to_other_client () =
  run_eio @@ fun () ->
  let hub = Sync.Event_hub.init () in
  let sub =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
         ~client_id:"phone")
  in
  Sync.Event_hub.publish hub ~user_id:"u1" ~db_name:"golf"
    ~exclude_client_id:"laptop" Sync.Event_hub.Upstream_change;
  await_upstream sub

let test_publish_excludes_writer_client_id () =
  run_eio @@ fun () ->
  let hub = Sync.Event_hub.init () in
  let phone =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
         ~client_id:"phone")
  in
  let laptop =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
         ~client_id:"laptop")
  in
  Sync.Event_hub.publish hub ~user_id:"u1" ~db_name:"golf"
    ~exclude_client_id:"laptop" Sync.Event_hub.Upstream_change;
  await_upstream phone;
  (* laptop must not receive — publish a second event without excluding it *)
  Sync.Event_hub.publish hub ~user_id:"u1" ~db_name:"golf"
    ~exclude_client_id:"phone" Sync.Event_hub.Upstream_change;
  await_upstream laptop

let test_tenant_isolation () =
  run_eio @@ fun () ->
  let hub = Sync.Event_hub.init () in
  let golf =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
         ~client_id:"c1")
  in
  let _notes =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"notes"
         ~client_id:"c1")
  in
  Sync.Event_hub.publish hub ~user_id:"u1" ~db_name:"golf" ~exclude_client_id:""
    Sync.Event_hub.Upstream_change;
  await_upstream golf

let test_capacity_rejects_eleventh () =
  run_eio @@ fun () ->
  let hub = Sync.Event_hub.init () in
  for i = 1 to Sync.Event_hub.max_subscribers_per_tenant do
    let client_id = Printf.sprintf "c%d" i in
    ignore
      (assert_ok
         (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
            ~client_id))
  done;
  match
    Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
      ~client_id:"overflow"
  with
  | Error `At_capacity -> ()
  | Ok _ -> failwith "expected At_capacity"

let test_unsubscribe_stops_delivery_and_frees_slot () =
  run_eio @@ fun () ->
  let hub = Sync.Event_hub.init () in
  let first =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
         ~client_id:"c1")
  in
  Sync.Event_hub.unsubscribe hub first;
  for i = 1 to Sync.Event_hub.max_subscribers_per_tenant do
    let client_id = Printf.sprintf "n%d" i in
    ignore
      (assert_ok
         (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
            ~client_id))
  done;
  match
    Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf" ~client_id:"full"
  with
  | Error `At_capacity -> ()
  | Ok _ -> failwith "expected At_capacity after refill"

let test_unsubscribe_unblocks_await () =
  run_eio @@ fun () ->
  let hub = Sync.Event_hub.init () in
  let sub =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
         ~client_id:"c1")
  in
  let result, resolve = Eio.Promise.create () in
  Eio.Fiber.both
    (fun () -> Eio.Promise.resolve resolve (Sync.Event_hub.await sub))
    (fun () ->
      (* Yield so await is waiting, then close. *)
      Eio.Fiber.yield ();
      Sync.Event_hub.unsubscribe hub sub);
  match Eio.Promise.await result with
  | None -> ()
  | Some _ -> failwith "expected None after unsubscribe"

let test_resubscribe_same_client_replaces_and_frees_capacity () =
  run_eio @@ fun () ->
  let hub = Sync.Event_hub.init () in
  (* Fill almost to capacity with distinct clients, plus one "phone". *)
  let first_phone =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
         ~client_id:"phone")
  in
  for i = 2 to Sync.Event_hub.max_subscribers_per_tenant do
    let client_id = Printf.sprintf "c%d" i in
    ignore
      (assert_ok
         (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
            ~client_id))
  done;
  (* At capacity — new client rejected *)
  (match
     Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
       ~client_id:"other"
   with
  | Error `At_capacity -> ()
  | Ok _ -> failwith "expected At_capacity");
  (* Same client_id reconnects: replaces old phone slot, does not reject *)
  let second_phone =
    assert_ok
      (Sync.Event_hub.subscribe hub ~user_id:"u1" ~db_name:"golf"
         ~client_id:"phone")
  in
  (* Old subscription must unblock *)
  (match Sync.Event_hub.await first_phone with
  | None -> ()
  | Some _ -> failwith "expected old phone subscription closed");
  Sync.Event_hub.publish hub ~user_id:"u1" ~db_name:"golf"
    ~exclude_client_id:"" Sync.Event_hub.Upstream_change;
  await_upstream second_phone

let () =
  test_subscribe_and_publish_delivers_to_other_client ();
  test_publish_excludes_writer_client_id ();
  test_tenant_isolation ();
  test_capacity_rejects_eleventh ();
  test_unsubscribe_stops_delivery_and_frees_slot ();
  test_unsubscribe_unblocks_await ();
  test_resubscribe_same_client_replaces_and_frees_capacity ()
