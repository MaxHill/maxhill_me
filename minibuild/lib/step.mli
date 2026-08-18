type t

val create
  :  ?should_skip:(Types.context -> bool)
  -> name:string
  -> apply:(Types.context -> (Types.context, Types.app_error) result)
  -> unit
  -> t

val run_step : ctx:Types.context -> t -> (Types.context, Types.app_error) result

val run_steps
  :  ctx:Types.context
  -> t list
  -> (Types.context, Types.app_error) result
