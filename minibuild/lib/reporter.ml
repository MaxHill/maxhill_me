type t = { prefix : string list }

let ansi_dim = "\x1b[2m"
let ansi_reset = "\x1b[0m"
let init () = { prefix = [] }

let overprint (reporter : t) msg =
  let prefix_formatted = String.concat " > " reporter.prefix in
  Format.eprintf "\r\x1b[K%s%s >%s %s" ansi_dim prefix_formatted ansi_reset msg;
  flush stderr
;;

let append_prefix (reporter : t) (prefix : string) : t =
  { prefix = reporter.prefix @ [ prefix ] }
;;
