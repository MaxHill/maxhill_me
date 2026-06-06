let did_raise f =
  try
    let _ = f () in
    false
  with
  | Failure _ -> true
  | _ -> false

let assert_defaults_from_cli () =
  let config =
    Sync.Config.init
      ~argv:
        [|
          "sync";
          "--auth-issuer-url";
          "https://issuer.example";
          "--auth-audience";
          "sync-users";
        |]
      ()
  in
  assert (config.port = 3001);
  assert (config.db_path = "./sync.db");
  assert (config.log_level = Some Logs.Info);
  assert (config.auth.issuer = "https://issuer.example");
  assert (config.auth.audience = "sync-users");
  assert (config.auth.allowed_algs = [ `RS256; `ES256 ])

let assert_cli_overrides_defaults () =
  let config =
    Sync.Config.init
      ~argv:
        [|
          "sync";
          "--port";
          "4321";
          "--db-path";
          "/tmp/custom-sync.db";
          "--log-level";
          "debug";
          "--auth-issuer-url";
          "https://cli-issuer.example";
          "--auth-audience";
          "cli-users";
          "--auth-allowed-algs";
          "HS256, ES256";
        |]
      ()
  in
  assert (config.port = 4321);
  assert (config.db_path = "/tmp/custom-sync.db");
  assert (config.log_level = Some Logs.Debug);
  assert (config.auth.issuer = "https://cli-issuer.example");
  assert (config.auth.audience = "cli-users");
  assert (config.auth.allowed_algs = [ `HS256; `ES256 ])

let assert_app_log_level_from_cli () =
  let config =
    Sync.Config.init
      ~argv:
        [|
          "sync";
          "--log-level";
          "app";
          "--auth-issuer-url";
          "https://issuer.example";
          "--auth-audience";
          "sync-users";
        |]
      ()
  in
  assert (config.log_level = None)

let assert_invalid_port_raises () =
  assert (
    did_raise (fun () ->
        Sync.Config.init
          ~argv:
            [|
              "sync";
              "--port";
              "not-a-port";
              "--auth-issuer-url";
              "https://issuer.example";
              "--auth-audience";
              "sync-users";
            |]
          ()))

let assert_missing_required_auth_raises () =
  assert (did_raise (fun () -> Sync.Config.init ~argv:[| "sync" |] ()))

let () =
  assert_defaults_from_cli ();
  assert_cli_overrides_defaults ();
  assert_app_log_level_from_cli ();
  assert_invalid_port_raises ();
  assert_missing_required_auth_raises ()
