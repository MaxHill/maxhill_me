type t
type frng_error = Out_of_entropy

val init : string -> t
val progress : t -> float
val take_bytes : t -> size:int -> (Bytes.t, frng_error) result
val take_int : t -> (int, frng_error) result
val take_bool : t -> (bool, frng_error) result
val take_range_inclusive : t -> min:int -> max:int -> (int, frng_error) result
val take_int_inclusive : t -> max:int -> (int, frng_error) result
val take_index : t -> 'a list -> (int, frng_error) result
val weighted_pick : t -> ('a * int) list -> ('a, frng_error) result
val swarm_weight_pick : t -> 'a list -> ('a, frng_error) result
