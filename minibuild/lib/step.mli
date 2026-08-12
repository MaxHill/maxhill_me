type t

val create
  :  ?should_skip:(unit -> bool)
  -> name:string
  -> apply:(unit -> (unit, string) result)
  -> unit
  -> t

val run_step : t -> (unit, string) result
val run_steps : t list -> (unit, string) result
