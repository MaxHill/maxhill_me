let _context_fields_are_accessible (context : Sync.Server.context) =
  let _ = context.db_pool in
  let _ = context.auth in
  let _ = context.event_hub in
  let _ = context.clock in
  ()

let assert_health_route () =
  let response, format = Sync.Server.route ~meth:`GET ~target:"/health" in
  assert (format = `Text);
  assert (response.status = `OK);
  assert (response.body = "ok")

let assert_unknown_route () =
  let response, format = Sync.Server.route ~meth:`GET ~target:"/unknown" in
  assert (format = `Text);
  assert (response.status = `Not_found)

let assert_wrong_method_route () =
  let response, _ = Sync.Server.route ~meth:`POST ~target:"/health" in
  assert (response.status = `Not_found)

let assert_subscribe_path_parsing () =
  assert (Sync.Server.subscribe_db_name "/subscribe/golf" = Some "golf");
  assert (Sync.Server.subscribe_db_name "/subscribe/" = None);
  assert (Sync.Server.subscribe_db_name "/sync" = None);
  assert (Sync.Server.subscribe_db_name "/subscribe/golf/extra" = None)

let assert_sse_upstream_frame () =
  let frame = Sync.Server.encode_sse_event Sync.Event_hub.Upstream_change in
  assert (String.equal frame "event: upstreamChange\ndata: {}\n\n")

let () =
  assert_health_route ();
  assert_unknown_route ();
  assert_wrong_method_route ();
  assert_subscribe_path_parsing ();
  assert_sse_upstream_frame ()
