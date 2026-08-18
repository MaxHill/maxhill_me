type context =
  { env : Eio_unix.Stdenv.base
  ; project_root : Eio.Fs.dir_ty Eio.Path.t
  ; reporter : Reporter.t
  }

let append_prefix (ctx : context) prefix =
  { ctx with reporter = Reporter.append_prefix ctx.reporter prefix }
;;

type command_error =
  { argv : string list
  ; status : Eio.Process.exit_status
  ; stderr : string
  }

type app_error =
  | CMD_Error of command_error
  | String_error of string

let command_error_to_string { argv; status; stderr } =
  let summary =
    Format.asprintf
      "command failed: %a\nexit status: %a"
      Eio.Process.pp_args
      argv
      Eio.Process.pp_status
      status
  in
  if String.trim stderr = ""
  then summary
  else Format.sprintf "%s\nstderr:\n%s" summary stderr
;;

let string_of_app_error = function
  | CMD_Error cmd_err -> command_error_to_string cmd_err
  | String_error s -> s
;;
