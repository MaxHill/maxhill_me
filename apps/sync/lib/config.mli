type auth = {
  issuer : string;
  audience : string;
  allowed_algs : Jose.Jwa.alg list;
}

type t = {
  port : int;
  db_path : string;
  log_level : Logs.level option;
  auth : auth;
}

(** [init ?getenv ()] reads config from environment variables via [getenv]
    (default: {!Sys.getenv_opt}). Tests pass a lookup function; prod relies on
    systemd's [EnvironmentFile=]. Raises {!Failure} on missing required vars
    or invalid values. *)
val init : ?getenv:(string -> string option) -> unit -> t
