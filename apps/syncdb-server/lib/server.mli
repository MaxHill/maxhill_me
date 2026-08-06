type response = { status : Httpun.Status.t; body : string }

type response_format = [ `Text | `Json ]

type context = {
  db_pool : Repository.pool;
  auth : Auth.t;
}

val route
  :  meth:Httpun.Method.t
  -> target:string
  -> response * response_format

val start
  :  < net : _ Eio.Net.t ; .. >
  -> sw:Eio.Switch.t
  -> port:int
  -> context:context
  -> unit
