(* Grandfather existing sources: lint only applies to files added after this list. *)
let excluded_basenames =
  [ "auth.ml"
  ; "config.ml"
  ; "db_name.ml"
  ; "repository.ml"
  ; "server.ml"
  ; "sync_engine_codec.ml"
  ; "sync_engine_core.ml"
  ; "sync_engine_hash.ml"
  ; "sync_engine_persistence.ml"
  ; "sync_engine_validation.ml"
  ; "sync_engine.ml"
  ; "main.ml"
  ; "simulator.ml"
  ; "simulator_sut.ml"
  ]
;;

let is_excluded path =
  let basename = Filename.basename path in
  Filename.check_suffix path ".pp.ml"
  || List.mem basename excluded_basenames
;;

let () =
  let files =
    Sys.argv
    |> Array.to_list
    |> List.tl
    |> List.filter (fun path -> not (is_excluded path))
  in
  Test_lint.run files
;;
