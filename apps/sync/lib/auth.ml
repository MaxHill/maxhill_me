type error =
  | Missing_authorization_header
  | Malformed_authorization_header
  | Invalid_or_expired_token
  | Token_algorithm_not_allowed
  | Token_issuer_mismatch
  | Token_audience_mismatch
  | Token_missing_user_id_claim

type user = { id : string }

type t = {
  cache_mutex : Eio.Mutex.t;
  mutable jwks : Jose.Jwks.t;
  issuer : string option;
  audience : string option;
  allowed_algs : Jose.Jwa.alg list;
}

let src = Logs.Src.create "sync.auth"

module Log = (val Logs.src_log src : Logs.LOG)

let error_to_string = function
  | Missing_authorization_header -> "missing authorization header"
  | Malformed_authorization_header -> "malformed authorization header"
  | Invalid_or_expired_token -> "invalid or expired token"
  | Token_algorithm_not_allowed -> "token algorithm not allowed"
  | Token_issuer_mismatch -> "token issuer mismatch"
  | Token_audience_mismatch -> "token audience mismatch"
  | Token_missing_user_id_claim -> "token missing userID claim"

let fetch_jwks env ~sw issuer_url =
  let jwks_url = String.trim issuer_url ^ "/.well-known/jwks.json" in
  let uri = Uri.of_string jwks_url in
  match Piaf.Client.Oneshot.get ~sw env uri with
  | Error err -> Error ("failed to fetch JWKS: " ^ Piaf.Error.to_string err)
  | Ok response -> (
      if Piaf.Status.to_code (Piaf.Response.status response) <> 200 then
        Error
          (Printf.sprintf "failed to fetch JWKS: status %d"
             (Piaf.Status.to_code (Piaf.Response.status response)))
      else
        match Piaf.Body.to_string (Piaf.Response.body response) with
        | Error err ->
            Error ("failed to read JWKS body: " ^ Piaf.Error.to_string err)
        | Ok body -> (
            try Ok (Jose.Jwks.of_string body)
            with exn ->
              Error
                (Printf.sprintf "failed to parse JWKS: %s"
                   (Printexc.to_string exn))))

let create_from_jwks ?issuer ?audience
    ?(allowed_algs = [ `HS256; `RS256; `ES256 ]) jwks =
  { cache_mutex = Eio.Mutex.create (); jwks; issuer; audience; allowed_algs }

let refresh_jwks_forever env cache ~issuer_url =
  let clock = Eio.Stdenv.clock env in
  while true do
    Eio.Time.sleep clock 300.0;
    Eio.Switch.run (fun sw ->
        match fetch_jwks env ~sw issuer_url with
        | Ok jwks ->
            Eio.Mutex.use_rw ~protect:false cache.cache_mutex (fun () ->
                cache.jwks <- jwks);
            Log.info (fun m -> m "JWKS cache refreshed")
        | Error msg -> Log.err (fun m -> m "JWKS refresh failed: %s" msg))
  done

let create env ~sw ~issuer_url ~audience ~allowed_algs =
  match fetch_jwks env ~sw issuer_url with
  | Error msg -> Error msg
  | Ok jwks ->
      let cache =
        create_from_jwks ~issuer:issuer_url ~audience ~allowed_algs jwks
      in
      Eio.Fiber.fork ~sw (fun () -> refresh_jwks_forever env cache ~issuer_url);
      Ok cache

let parse_bearer_header = function
  | None -> Error Missing_authorization_header
  | Some header -> (
      let parts =
        header |> String.split_on_char ' '
        |> List.filter (fun s -> String.length s > 0)
      in
      match parts with
      | [ scheme; token ] when String.lowercase_ascii scheme = "bearer" ->
          Ok token
      | _ -> Error Malformed_authorization_header)

let keys_for_token jwks token =
  match Jose.Jwt.unsafe_of_string token with
  | Error _ -> []
  | Ok jwt -> (
      match jwt.header.kid with
      | Some kid -> (
          match Jose.Jwks.find_key jwks kid with
          | Some key -> [ key ]
          | None -> jwks.keys)
      | None -> jwks.keys)

let validate_with_any_key jwks token =
  let candidates = keys_for_token jwks token in
  let now = Ptime_clock.now () in
  let rec loop = function
    | [] -> Error Invalid_or_expired_token
    | key :: rest -> (
        match Jose.Jwt.of_string ~jwk:key ~now token with
        | Ok jwt -> Ok jwt
        | Error _ -> loop rest)
  in
  loop candidates

let ensure_alg_allowed t jwt =
  if List.mem jwt.Jose.Jwt.header.alg t.allowed_algs then Ok ()
  else Error Token_algorithm_not_allowed

let ensure_issuer t jwt =
  match t.issuer with
  | None -> Ok ()
  | Some expected -> (
      match Jose.Jwt.get_string_claim jwt "iss" with
      | Some actual when actual = expected -> Ok ()
      | _ -> Error Token_issuer_mismatch)

let audience_claim_matches jwt expected =
  match Jose.Jwt.get_yojson_claim jwt "aud" with
  | Some (`String value) -> value = expected
  | Some (`List values) ->
      List.exists
        (function `String value -> value = expected | _ -> false)
        values
  | _ -> false

let ensure_audience t jwt =
  match t.audience with
  | None -> Ok ()
  | Some expected ->
      if audience_claim_matches jwt expected then Ok ()
      else Error Token_audience_mismatch

let user_id_from_jwt jwt =
  match Jose.Jwt.get_string_claim jwt "userID" with
  | Some user_id when String.length user_id > 0 -> Some user_id
  | _ -> Jose.Jwt.get_string_claim jwt "sub"

let validate_bearer t authorization_header =
  match parse_bearer_header authorization_header with
  | Error _ as err -> err
  | Ok token ->
      let jwks = Eio.Mutex.use_ro t.cache_mutex (fun () -> t.jwks) in
      match validate_with_any_key jwks token with
      | Error _ as err -> err
      | Ok jwt -> (
          match ensure_alg_allowed t jwt with
          | Error _ as err -> err
          | Ok () -> (
              match ensure_issuer t jwt with
              | Error _ as err -> err
              | Ok () -> (
                  match ensure_audience t jwt with
                  | Error _ as err -> err
                  | Ok () -> (
                      match user_id_from_jwt jwt with
                      | Some user_id -> Ok { id = user_id }
                      | None -> Error Token_missing_user_id_claim))))
