type t = { entropy : bytes; mutable pos : int }
type frng_error = Out_of_entropy

let ( let* ) = Result.bind
let init entropy = { entropy = Bytes.of_string entropy; pos = 0 }
let remaining t = Bytes.length t.entropy - t.pos

let progress t =
  try float_of_int t.pos /. float_of_int (Bytes.length t.entropy)
  with Division_by_zero -> 0.

let take_bytes t ~size =
  if remaining t < size then Error Out_of_entropy
  else
    let out = Bytes.sub t.entropy t.pos size in
    t.pos <- t.pos + size;
    Ok out

let take_int t =
  if remaining t < 8 then Error Out_of_entropy
  else
    let out =
      Bytes.get_int64_le t.entropy t.pos
      |> Int64.logand 0x3FFF_FFFF_FFFF_FFFFL
      |> Int64.to_int
    in
    t.pos <- t.pos + 8;
    Ok out

let take_bool t =
  take_int t
  |> Result.map (fun number -> number land 1)
  |> Result.map (fun number -> number = 1)

let take_int_inclusive t ~max =
  assert (max >= 0);
  if max = Int.max_int then take_int t
  else
    let bound = max + 1 in
    let limit = Int.max_int - (Int.max_int mod bound) in
    let rec loop () =
      let* x = take_int t in
      if x < limit then Ok (x mod bound) else loop ()
    in
    loop ()

let take_range_inclusive t ~min ~max =
  assert (min <= max);

  take_int_inclusive t ~max:(max - min) |> Result.map (fun value -> value + min)

let take_index t slice =
  let length = List.length slice in
  assert (length > 0);

  take_range_inclusive t ~min:0 ~max:(length - 1)

let weighted_pick t (weights : ('a * int) list) : ('a, frng_error) result =
  let total =
    List.fold_left
      (fun acc (_, w) ->
        assert (w >= 0);
        acc + w)
      0 weights
  in
  assert (weights <> []);
  assert (total > 0);
  assert (total <= Int.max_int);

  let* pick_initial = take_int_inclusive t ~max:(total - 1) in

  let rec loop pick = function
    | [] ->
        (* unreachable if total > 0 and list unchanged *)
        failwith "weighted: unreachable"
    | (choice, w) :: rest ->
        if pick < w then Ok choice else loop (pick - w) rest
  in
  loop pick_initial weights

let swarm_weight_pick t (options : 'a list) =
  let rec build_weights acc = function
    | [] -> Ok (List.rev acc)
    | choice :: rest ->
        let* weight = take_range_inclusive t ~min:1 ~max:100 in
        build_weights ((choice, weight) :: acc) rest
  in
  let* weights = build_weights [] options in
  weighted_pick t weights
