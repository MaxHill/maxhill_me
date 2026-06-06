let _context_fields_are_accessible (context : Sync.Server.context) =
  let _ = context.db_pool in
  let _ = context.auth in
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

let () =
  assert_health_route ();
  assert_unknown_route ();
  assert_wrong_method_route ()
