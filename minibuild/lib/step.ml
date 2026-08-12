open Shared

type t =
  { name : string
  ; should_skip : unit -> bool (* true = already satisfied *)
  ; apply : unit -> (unit, string) result
  }

let create ?(should_skip = fun () -> false) ~name ~apply () =
  { name; should_skip; apply }
;;

let run_step step =
  match step.should_skip () with
  | true ->
    Format.eprintf "step: %s [skipping]\n" step.name;
    Ok ()
  | false ->
    Format.eprintf "step: %s\n" step.name;
    step.apply ()
;;

let%expect_test "run_step" =
  let step =
    create
      ~name:"Step"
      ~apply:(fun () ->
        Format.eprintf "  Step output\n";
        Ok ())
      ()
  in
  let _ =
    match run_step step with
    | Ok () -> ()
    | Error _ -> ()
  in
  [%expect
    {|
    step: Step
      Step output
    |}]
;;

let rec run_steps = function
  | [] -> Ok ()
  | step :: remaining_steps ->
    (match run_step step with
     | Ok () -> run_steps remaining_steps
     | Error _ as error -> error)
;;

let%expect_test "should skip" =
  let should_skip =
    create
      ~name:"Shold skip"
      ~should_skip:(fun () -> true)
      ~apply:(fun () ->
        Format.eprintf "  This should never be printed\n";
        Error "This codepath should never hit")
      ()
  in
  let should_run =
    create
      ~name:"Shold run"
      ~apply:(fun () ->
        Format.eprintf "  This should run\n";
        Ok ())
      ()
  in
  let _ =
    match run_steps [ should_skip; should_run ] with
    | Ok _ -> ()
    | Error _ -> ()
  in
  [%expect
    {|
    step: Shold skip [skipping]
    step: Shold run
      This should run
    |}]
;;
