open Shared

type t =
  { name : string
  ; should_skip : Types.context -> bool (* true = already satisfied *)
  ; apply : Types.context -> (Types.context, Types.app_error) result
  }

let create ?(should_skip = fun _ctx -> false) ~name ~apply () =
  { name; should_skip; apply }
;;

let run_step ~ctx step =
  match step.should_skip ctx with
  | true ->
    Reporter.overprint ctx.reporter (Format.sprintf " [skip] %s " step.name);
    Ok ctx
  | false ->
    Reporter.overprint ctx.reporter (Format.sprintf " %s" step.name);
    step.apply ctx
;;

let%expect_test "run_step" =
  Eio_main.run
  @@ fun env ->
  let ctx =
    Types.
      { env
      ; project_root = Eio.Path.(Eio.Stdenv.cwd env / ".")
      ; reporter = Reporter.init ()
      }
  in
  let step =
    create
      ~name:"Step"
      ~apply:(fun ctx ->
        Format.eprintf "  Step output\n";
        Ok ctx)
      ()
  in
  let _ =
    match run_step ~ctx step with
    | Ok _ -> ()
    | Error _ -> ()
  in
  [%expect
    {|
    [run ]: Step
      Step output
    |}]
;;

let rec run_steps ~ctx = function
  | [] -> Ok ctx
  | step :: remaining_steps ->
    (match run_step ~ctx step with
     | Ok ctx -> run_steps ~ctx remaining_steps
     | Error _ as error -> error)
;;

let%expect_test "should skip" =
  Eio_main.run
  @@ fun env ->
  let ctx =
    { Types.env
    ; project_root = Eio.Path.(Eio.Stdenv.cwd env / ".")
    ; reporter = Reporter.init ()
    }
  in
  let should_skip =
    create
      ~name:"Shold skip"
      ~should_skip:(fun _ctx -> true)
      ~apply:(fun _ctx ->
        Format.eprintf "  This should never be printed\n";
        Error (Types.String_error "This codepath should never hit"))
      ()
  in
  let should_run =
    create
      ~name:"Shold run"
      ~apply:(fun ctx ->
        Format.eprintf "  This should run\n";
        Ok ctx)
      ()
  in
  let _ =
    match run_steps ~ctx [ should_skip; should_run ] with
    | Ok _ -> ()
    | Error _ -> ()
  in
  [%expect
    {|
    [skip]: Shold skip
    [run ]: Shold run
      This should run
    |}]
;;
