(* Custom reporter for minibuild that shows command hierarchy *)

let depth = ref 0

(* Tags for categorizing logs *)
let executing_tag = Logs.Tag.def "executing" Format.pp_print_bool

let reporter () =
  let report src level ~over k msgf =
    let indent = String.make (!depth * 2) ' ' in
    (* Capture the message to check if it's an executing message *)
    let buf = Buffer.create 128 in
    let buf_fmt = Format.formatter_of_buffer buf in
    msgf
    @@ fun ?header ?tags fmt ->
    (* First format to buffer to check content *)
    Format.kfprintf
      (fun _ ->
         Format.pp_print_flush buf_fmt ();
         let msg = Buffer.contents buf in
         Format.fprintf Format.err_formatter "%s %s@." indent msg;
         over ();
         k ())
      buf_fmt
      fmt
  in
  { Logs.report }
;;

let with_indent f =
  incr depth;
  Fun.protect ~finally:(fun () -> decr depth) f
;;

let tag_executing = Logs.Tag.(empty |> add executing_tag true)
