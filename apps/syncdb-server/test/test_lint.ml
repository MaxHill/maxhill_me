open Walker

(* Validators *)
(* ======================*)
let max_function_lines = 70
let min_assertions_per_function = 2

type assertion_density =
  { function_count : int
  ; assertion_count : int
  }
;;

let assertion_density_of_structure structure =
  let function_count = ref 0 in
  let assertion_count = ref 0 in
  let iterator =
    { Ast_iterator.default_iterator with
      expr =
        (fun self expr ->
          (match expr.pexp_desc with
           | Pexp_function _ -> incr function_count
           | Pexp_assert _ -> incr assertion_count
           | _ -> ());
          Ast_iterator.default_iterator.expr self expr)
    }
  in
  iterator.structure iterator structure;
  { function_count = !function_count; assertion_count = !assertion_count }
;;

let assertion_density_validator structure =
  let { function_count; assertion_count } = assertion_density_of_structure structure in
  let minimum = function_count * min_assertions_per_function in
  if assertion_count < minimum
  then
    Some
      (Format.sprintf
         ("source has %d assertion-like calls across %d checked functions. "
          ^^ "Minimum is %d total (%d per function average).")
         assertion_count
         function_count
         minimum
         min_assertions_per_function)
  else None
;;

let function_length_validator ~kind ~name ~loc =
  let start_line = loc.Location.loc_start.Lexing.pos_lnum in
  let end_line = loc.Location.loc_end.Lexing.pos_lnum in
  let line_count = end_line - start_line + 1 in
  if line_count > max_function_lines
  then
    Some
      (Format.sprintf
         "%s%s is too long (%d lines). Maximum is %d lines."
         kind
         (match name with
          | None -> ""
          | Some value -> Format.sprintf " \"%s\"" value)
         line_count
         max_function_lines)
  else None
;;

let name_validator name =
  match String.lowercase_ascii name with
  | "arg" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"argument\""
         name)
  | "args" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"arguments\""
         name)
  | "buf" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"buffer\""
         name)
  | "cfg" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \
          \"configuration\""
         name)
  | "dest" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \
          \"destination\""
         name)
  | "dst" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \
          \"destination\""
         name)
  | "err" ->
    Some
      (Format.sprintf
         "err abbriviation is not allowed use full names like: \"error\"")
  | "errs" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"errors\""
         name)
  | "fn" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"function\""
         name)
  | "fmt" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"format\""
         name)
  | "idx" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"index\""
         name)
  | "len" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"length\""
         name)
  | "msg" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"message\""
         name)
  | "num" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"number\""
         name)
  | "obj" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"object\""
         name)
  | "op" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"operation\""
         name)
  | "param" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"parameter\""
         name)
  | "params" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \
          \"parameters\""
         name)
  | "pos" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"position\""
         name)
  | "prev" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"previous\""
         name)
  | "ptr" ->
    Some
      (Format.sprintf
         "ptr abbriviation is not allowed use full names like: \"pointer\"")
  | "ref" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"reference\""
         name)
  | "req" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"request\""
         name)
  | "resp" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"response\""
         name)
  | "src" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"source\""
         name)
  | "tmp" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"temporary\""
         name)
  | "val" ->
    Some
      (Format.sprintf
         "\"%s\" abbriviation is not allowed use full names like: \"value\""
         name)
  | _ -> None
;;

(* Checkers*)
(* ======================*)
let check_variable ~ctx:_ (pat : Parsetree.pattern) _expr =
  let naming_error =
    match pat.ppat_desc with
    | Ppat_var name -> name_validator name.txt
    | _ -> None
  in
  [ naming_error ]
;;

let check_function ~ctx:_ (pat : Parsetree.pattern) (expr : Parsetree.expression) =
  let function_name =
    match pat.ppat_desc with
    | Ppat_var name -> Some name.txt
    | _ -> None
  in
  let naming_error =
    match pat.ppat_desc with
    | Ppat_var name -> name_validator name.txt
    | _ -> None
  in
  let length_error =
    function_length_validator
      ~kind:"function"
      ~name:function_name
      ~loc:expr.pexp_loc
  in
  [ naming_error; length_error ]
;;

let check_module ~ctx:_ ~loc:_ name =
  let naming_error = name_validator name in
  [ naming_error ]
;;

let check_type ~ctx:_ (type_declaration : Parsetree.type_declaration) =
  let naming_error = name_validator type_declaration.ptype_name.txt in
  [ naming_error ]
;;

let check_class ~ctx:_ ~loc:_ name =
  let naming_error = name_validator name in
  [ naming_error ]
;;

let check_class_method ~ctx:_ ~loc name _method_expr =
  let naming_error = name_validator name in
  let length_error =
    function_length_validator ~kind:"class method" ~name:(Some name) ~loc
  in
  [ naming_error; length_error ]
;;

let check_class_value ~ctx:_ ~loc:_ name =
  let naming_error = name_validator name in
  [ naming_error ]
;;

let lint_checkers =
  { Walker.default_checkers with
    check_variable
  ; check_function
  ; check_module
  ; check_type
  ; check_class
  ; check_class_method
  ; check_class_value
  }
;;

let print_error error =
  let start_line, end_line =
    match error.loc with
    | None -> 0, 0
    | Some loc -> loc.loc_start.pos_lnum, loc.loc_end.pos_lnum
  in
  Printf.printf "%s:%d:1: error: %s\n" error.filename start_line error.message;
  if end_line <> start_line
  then Printf.printf "%s:%d:1: note: lint span ends here\n" error.filename end_line
;;

let check_file filename =
  let ctx = init_ctx ~checkers:lint_checkers filename in
  Format.printf "\nfile %s%!" filename;
  let ast = get_ast filename in
  let ctx = walk_structure ctx ast |> finalize_ctx in
  let errors = List.filter_map (fun error -> error) ctx.errors in
  let errors =
    match assertion_density_validator ast with
    | None -> errors
    | Some message ->
      { message; filename; scope_depth = 0; loc = None } :: errors
  in
  List.iter print_error errors;
  List.length errors
;;

let run files =
  let error_count =
    List.fold_left (fun total file -> total + check_file file) 0 files
  in
  if error_count > 0
  then failwith (Printf.sprintf "lint failed with %d errors" error_count)
;;
