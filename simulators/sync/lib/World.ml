let ( let* ) = Result.bind

type t = { mutable a : int; mutable b : int; frng : FRNG.t }

let init frng = Ok { a = 5; b = 5; frng }

let check_invariants w =
  assert (w.a + w.b = 10);
  assert (w.a >= 0);
  assert (w.b >= 0)

let step w =
  (* let* action2 = *)
  (*   FRNG.weighted_pick w.frng *)
  (*     [ (`Transfer_a_to_b, 10); (`Transfer_b_to_a, 20); (`Inquiry, 30) ] *)
  (* in *)
  let* action =
    FRNG.swarm_weight_pick w.frng
      [ `Transfer_a_to_b; `Transfer_b_to_a; `Inquiry ]
  in
  let* () =
    match action with
    | `Transfer_a_to_b ->
        let* amt = FRNG.take_range_inclusive w.frng ~min:1 ~max:3 in
        w.a <- w.a - amt;
        w.b <- w.b + amt;
        Ok ()
    | `Transfer_b_to_a ->
        let* amt = FRNG.take_range_inclusive w.frng ~min:1 ~max:3 in
        w.b <- w.b - amt;
        w.a <- w.a + amt;
        Ok ()
    | `Inquiry -> Ok ()
  in
  check_invariants w;
  Ok ()

let run w =
  let rec loop () =
    match step w with Ok () -> loop () | Error FRNG.Out_of_entropy -> ()
  in
  loop ()
