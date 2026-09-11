type response = { status : Httpun.Status.t; body : string }

type response_format = [ `Text | `Json ]

type context = {
  db_pool : Repository.pool;
  auth : Auth.t;
  event_hub : Event_hub.t;
  clock : float Eio.Time.clock_ty Eio.Std.r;
}

val route
  :  meth:Httpun.Method.t
  -> target:string
  -> response * response_format

(** Parse ["/subscribe/<dbName>"]. *)
val subscribe_db_name : string -> string option

val encode_sse_event : Event_hub.event -> string

val start
  :  < net : _ Eio.Net.t ; .. >
  -> sw:Eio.Switch.t
  -> port:int
  -> context:context
  -> unit
