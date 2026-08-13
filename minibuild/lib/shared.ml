let ( let* ) = Result.bind
let ( let+ ) = Result.map

let results_all_array array_of_result =
  Array.fold_right
    (fun x acc ->
       match x, acc with
       | Error e, _ -> Error e
       | Ok v, Ok vs -> Ok (v :: vs)
       | _, Error e -> Error e)
    array_of_result
    (Ok [])
;;

let results_all_list array_of_result =
  List.fold_right
    (fun x acc ->
       match x, acc with
       | Error e, _ -> Error e
       | Ok v, Ok vs -> Ok (v :: vs)
       | _, Error e -> Error e)
    array_of_result
    (Ok [])
;;

let result_bind ~f res = Result.bind res f
let result_map ~f res = Result.map res f
