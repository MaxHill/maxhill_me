open Hegel

let%hegel_test greeting_is_not_empty tc =
  let name = draw tc (Generators.text ~min_size:1 ()) in
  assert (String.length (Minibuild.greet name) > 8)
;;

let () = greeting_is_not_empty ()
