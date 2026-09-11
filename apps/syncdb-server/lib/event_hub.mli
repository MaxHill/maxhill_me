(** Process-local fan-out of tenant wake-ups (see ADR 0004). *)

type event = Upstream_change

type t
type subscription

val max_subscribers_per_tenant : int

val init : unit -> t

val subscribe
  :  t
  -> user_id:string
  -> db_name:string
  -> client_id:string
  -> (subscription, [ `At_capacity ]) result

val unsubscribe : t -> subscription -> unit

(** Block until the next event, or [None] if the subscription was closed. *)
val await : subscription -> event option

val publish
  :  t
  -> user_id:string
  -> db_name:string
  -> exclude_client_id:string
  -> event
  -> unit
