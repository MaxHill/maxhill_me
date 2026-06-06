let make_auth_and_sign ?issuer ?audience ?(allowed_algs = [ `HS256; `RS256; `ES256 ]) ~claims () =
  let key = Jose.Jwk.make_oct "super-secret" in
  let public_key = Jose.Jwk.pub_of_priv key in
  let jwks = { Jose.Jwks.keys = [ public_key ] } in
  let auth = Sync.Auth.create_from_jwks ?issuer ?audience ~allowed_algs jwks in
  let payload =
    List.fold_left
      (fun acc (k, v) -> Jose.Jwt.add_claim k v acc)
      Jose.Jwt.empty_payload claims
  in
  let token =
    match Jose.Jwt.sign ~payload key with
    | Ok jwt -> Jose.Jwt.to_string jwt
    | Error (`Msg msg) -> failwith ("failed to sign token: " ^ msg)
  in
  (auth, token)

let now_unix_int () =
  Ptime_clock.now ()
  |> Ptime.to_float_s
  |> int_of_float

let assert_error expected = function
  | Error actual -> assert (actual = expected)
  | Ok _ -> failwith "expected auth validation error"

let assert_missing_header_rejected () =
  let auth, _ = make_auth_and_sign ~claims:[] () in
  assert_error Sync.Auth.Missing_authorization_header
    (Sync.Auth.validate_bearer auth None)

let assert_malformed_header_rejected () =
  let auth, token = make_auth_and_sign ~claims:[] () in
  assert_error Sync.Auth.Malformed_authorization_header
    (Sync.Auth.validate_bearer auth (Some ("Token " ^ token)))

let assert_valid_token_returns_subject () =
  let exp = now_unix_int () + 3600 in
  let auth, token =
    make_auth_and_sign
      ~issuer:"https://issuer.test"
      ~audience:"sync-api"
      ~allowed_algs:[ `HS256 ]
      ~claims:
        [ ("sub", `String "user-123")
        ; ("exp", `Int exp)
        ; ("iss", `String "https://issuer.test")
        ; ("aud", `String "sync-api")
        ]
      ()
  in
  match Sync.Auth.validate_bearer auth (Some ("Bearer " ^ token)) with
  | Ok user -> assert (user.id = "user-123")
  | Error err ->
      failwith
        ("expected valid token, got error: " ^ Sync.Auth.error_to_string err)

let assert_expired_token_rejected () =
  let exp = now_unix_int () - 3600 in
  let auth, token =
    make_auth_and_sign ~claims:[ ("sub", `String "user-123"); ("exp", `Int exp) ] ()
  in
  assert_error Sync.Auth.Invalid_or_expired_token
    (Sync.Auth.validate_bearer auth (Some ("Bearer " ^ token)))

let assert_issuer_mismatch_rejected () =
  let exp = now_unix_int () + 3600 in
  let auth, token =
    make_auth_and_sign
      ~issuer:"https://issuer.expected"
      ~allowed_algs:[ `HS256 ]
      ~claims:[ ("sub", `String "user-123"); ("exp", `Int exp); ("iss", `String "https://issuer.actual") ]
      ()
  in
  assert_error Sync.Auth.Token_issuer_mismatch
    (Sync.Auth.validate_bearer auth (Some ("Bearer " ^ token)))

let assert_audience_mismatch_rejected () =
  let exp = now_unix_int () + 3600 in
  let auth, token =
    make_auth_and_sign
      ~audience:"sync-api"
      ~allowed_algs:[ `HS256 ]
      ~claims:[ ("sub", `String "user-123"); ("exp", `Int exp); ("aud", `String "other-api") ]
      ()
  in
  assert_error Sync.Auth.Token_audience_mismatch
    (Sync.Auth.validate_bearer auth (Some ("Bearer " ^ token)))

let assert_algorithm_not_allowed_rejected () =
  let exp = now_unix_int () + 3600 in
  let auth, token =
    make_auth_and_sign
      ~allowed_algs:[ `RS256; `ES256 ]
      ~claims:[ ("sub", `String "user-123"); ("exp", `Int exp) ]
      ()
  in
  assert_error Sync.Auth.Token_algorithm_not_allowed
    (Sync.Auth.validate_bearer auth (Some ("Bearer " ^ token)))

let () =
  assert_missing_header_rejected ();
  assert_malformed_header_rejected ();
  assert_valid_token_returns_subject ();
  assert_expired_token_rejected ();
  assert_issuer_mismatch_rejected ();
  assert_audience_mismatch_rejected ();
  assert_algorithm_not_allowed_rejected ()
