type step =
  { name : string
  ; check : unit -> bool (* true = already satisfied *)
  ; apply : unit -> (unit, string) result
  }

let run_step step =
  match step.check () with
  | true ->
    Format.eprintf "step: %s [skipping]\n" step.name;
    Ok ()
  | false ->
    Format.eprintf "step: %s\n" step.name;
    step.apply ()
;;

let%expect_test "should skip" =
  let should_skip =
    { name = "Shold skip"
    ; check = (fun () -> true)
    ; apply =
        (fun () ->
          Format.eprintf "  This should never be printed\n";
          Error "This codepath should never hit")
    }
  in
  let should_run =
    { name = "Shold run"
    ; check = (fun () -> false)
    ; apply =
        (fun () ->
          Format.eprintf "  This should run\n";
          Ok ())
    }
  in
  let _ =
    match run_step should_skip with
    | Ok () -> ()
    | Error _ -> ()
  in
  let _ =
    match run_step should_run with
    | Ok () -> ()
    | Error _ -> ()
  in
  [%expect
    {|
    step: Shold skip [skipping]
    step: Shold run
      This should run
    |}]
;;
