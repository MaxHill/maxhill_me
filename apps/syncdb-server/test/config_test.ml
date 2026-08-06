let did_raise f =
  try
    let _ = f () in
    false
  with
  | Failure _ -> true
  | _ -> false

let env_of alist =
  let tbl = Hashtbl.create (List.length alist) in
  List.iter (fun (k, v) -> Hashtbl.replace tbl k v) alist;
  fun name -> Hashtbl.find_opt tbl name

let required_only =
  [ ("AUTH_ISSUER_URL", "https://issuer.example"); ("AUTH_AUDIENCE", "sync-users") ]

let assert_defaults_from_env () =
  let config = Sync.Config.init ~getenv:(env_of required_only) () in
  assert (config.port = 3001);
  assert (config.db_path = "./sync.db");
  assert (config.log_level = Some Logs.Info);
  assert (config.auth.issuer = "https://issuer.example");
  assert (config.auth.audience = "sync-users");
  assert (config.auth.allowed_algs = [ `RS256; `ES256 ])

let assert_env_overrides_defaults () =
  let config =
    Sync.Config.init
      ~getenv:
        (env_of
           [
             ("PORT", "4321");
             ("DB_PATH", "/tmp/custom-sync.db");
             ("LOG_LEVEL", "debug");
             ("AUTH_ISSUER_URL", "https://env-issuer.example");
             ("AUTH_AUDIENCE", "env-users");
             ("AUTH_ALLOWED_ALGS", "HS256, ES256");
           ])
      ()
  in
  assert (config.port = 4321);
  assert (config.db_path = "/tmp/custom-sync.db");
  assert (config.log_level = Some Logs.Debug);
  assert (config.auth.issuer = "https://env-issuer.example");
  assert (config.auth.audience = "env-users");
  assert (config.auth.allowed_algs = [ `HS256; `ES256 ])

let assert_app_log_level_from_env () =
  let config =
    Sync.Config.init
      ~getenv:(env_of (("LOG_LEVEL", "app") :: required_only))
      ()
  in
  assert (config.log_level = None)

let assert_invalid_port_raises () =
  assert (
    did_raise (fun () ->
        Sync.Config.init
          ~getenv:(env_of (("PORT", "not-a-port") :: required_only))
          ()))

let assert_missing_required_auth_raises () =
  assert (did_raise (fun () -> Sync.Config.init ~getenv:(env_of []) ()))

let () =
  assert_defaults_from_env ();
  assert_env_overrides_defaults ();
  assert_app_log_level_from_env ();
  assert_invalid_port_raises ();
  assert_missing_required_auth_raises ()
