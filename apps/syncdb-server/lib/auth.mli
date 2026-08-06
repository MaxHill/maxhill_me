type error =
  | Missing_authorization_header
  | Malformed_authorization_header
  | Invalid_or_expired_token
  | Token_algorithm_not_allowed
  | Token_issuer_mismatch
  | Token_audience_mismatch
  | Token_missing_user_id_claim

type user = { id : string }

type t

val error_to_string : error -> string

val create
  :  Eio_unix.Stdenv.base
  -> sw:Eio.Switch.t
  -> issuer_url:string
  -> audience:string
  -> allowed_algs:Jose.Jwa.alg list
  -> (t, string) result

val create_from_jwks
  :  ?issuer:string
  -> ?audience:string
  -> ?allowed_algs:Jose.Jwa.alg list
  -> Jose.Jwks.t
  -> t

val validate_bearer : t -> string option -> (user, error) result
