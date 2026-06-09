type t
type frng_error = Out_of_entropy

val init : string -> t
val take_bytes : t -> size:int -> (Bytes.t, frng_error) result
