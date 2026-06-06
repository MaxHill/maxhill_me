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

let parse_port = function
  | None -> 3001
  | Some raw -> (
      match int_of_string_opt raw with
      | Some n when n > 0 && n <= 65535 -> n
      | _ -> failwith "--port must be a valid integer between 1 and 65535")

let parse_log_level = function
  | None -> Some Logs.Info
  | Some value -> (
      match String.lowercase_ascii value with
      | "app" -> None
      | "error" -> Some Logs.Error
      | "warning" -> Some Logs.Warning
      | "info" -> Some Logs.Info
      | "debug" -> Some Logs.Debug
      | _ -> failwith "--log-level must be one of: app|error|warning|info|debug"
      )

let parse_db_path = function
  | Some path when String.length path > 0 -> path
  | _ -> "./sync.db"

let required_value name = function
  | Some value when String.length value > 0 -> value
  | _ -> failwith (name ^ " is required")

let parse_alg value =
  match String.uppercase_ascii (String.trim value) with
  | "RS256" -> `RS256
  | "ES256" -> `ES256
  | "HS256" -> `HS256
  | other -> failwith ("unsupported --auth-allowed-algs entry: " ^ other)

let parse_allowed_algs = function
  | None -> [ `RS256; `ES256 ]
  | Some raw ->
      raw |> String.split_on_char ','
      |> List.filter (fun s -> String.length (String.trim s) > 0)
      |> List.map parse_alg

let init ?argv () =
  let port = ref None in
  let db_path = ref None in
  let log_level = ref None in
  let auth_issuer = ref None in
  let auth_audience = ref None in
  let auth_allowed_algs = ref None in
  let set field value = field := Some value in
  let specs =
    [
      ("--port", Arg.String (set port), "Port to listen on");
      ("--db-path", Arg.String (set db_path), "SQLite database path");
      ( "--log-level",
        Arg.String (set log_level),
        "Log level: app|error|warning|info|debug" );
      ("--auth-issuer-url", Arg.String (set auth_issuer), "JWT issuer URL");
      ("--auth-audience", Arg.String (set auth_audience), "JWT audience");
      ( "--auth-allowed-algs",
        Arg.String (set auth_allowed_algs),
        "Comma-separated JWT algorithms" );
    ]
  in
  let usage = "sync [--port PORT] [--db-path PATH] [--log-level LEVEL]" in
  let argv = Option.value ~default:Sys.argv argv in
  let current = ref 0 in
  let anon arg = raise (Arg.Bad ("unexpected anonymous argument: " ^ arg)) in
  (try Arg.parse_argv ~current argv specs anon usage
   with Arg.Bad msg | Arg.Help msg -> failwith msg);
  {
    port = parse_port !port;
    db_path = parse_db_path !db_path;
    log_level = parse_log_level !log_level;
    auth =
      {
        issuer = required_value "--auth-issuer-url" !auth_issuer;
        audience = required_value "--auth-audience" !auth_audience;
        allowed_algs = parse_allowed_algs !auth_allowed_algs;
      };
  }
