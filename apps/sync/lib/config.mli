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

val init : ?argv:string array -> unit -> t
