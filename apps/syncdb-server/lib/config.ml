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

(* Env-var driven. The service unit ships an EnvironmentFile= at
   /etc/sync/sync.prod.env; systemd sets these before ExecStart=.
   For dev, source vps/sync/sync.dev.env (or run under mise). *)

let parse_port = function
  | None -> 3001
  | Some raw -> (
      match int_of_string_opt raw with
      | Some n when n > 0 && n <= 65535 -> n
      | _ -> failwith "PORT must be a valid integer between 1 and 65535")

let parse_log_level = function
  | None -> Some Logs.Info
  | Some value -> (
      match String.lowercase_ascii (String.trim value) with
      | "app" -> None
      | "error" -> Some Logs.Error
      | "warning" -> Some Logs.Warning
      | "info" -> Some Logs.Info
      | "debug" -> Some Logs.Debug
      | _ -> failwith "LOG_LEVEL must be one of: app|error|warning|info|debug")

let parse_db_path = function
  | Some path when String.length path > 0 -> path
  | _ -> "./sync.db"

let required_value name = function
  | Some value when String.length (String.trim value) > 0 -> String.trim value
  | _ -> failwith (name ^ " is required")

let parse_alg value =
  match String.uppercase_ascii (String.trim value) with
  | "RS256" -> `RS256
  | "ES256" -> `ES256
  | "HS256" -> `HS256
  | other -> failwith ("unsupported AUTH_ALLOWED_ALGS entry: " ^ other)

let parse_allowed_algs = function
  | None -> [ `RS256; `ES256 ]
  | Some raw ->
      raw |> String.split_on_char ','
      |> List.filter (fun s -> String.length (String.trim s) > 0)
      |> List.map parse_alg

let init ?(getenv = Sys.getenv_opt) () =
  let opt name =
    match getenv name with
    | Some v when String.length (String.trim v) > 0 -> Some (String.trim v)
    | _ -> None
  in
  {
    port = parse_port (opt "PORT");
    db_path = parse_db_path (opt "DB_PATH");
    log_level = parse_log_level (opt "LOG_LEVEL");
    auth =
      {
        issuer = required_value "AUTH_ISSUER_URL" (opt "AUTH_ISSUER_URL");
        audience = required_value "AUTH_AUDIENCE" (opt "AUTH_AUDIENCE");
        allowed_algs = parse_allowed_algs (opt "AUTH_ALLOWED_ALGS");
      };
  }
