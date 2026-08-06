let error_message = "invalid dbName: must match ^[A-Za-z0-9_-]{1,64}$"

let is_allowed_char = function
  | 'a' .. 'z' | 'A' .. 'Z' | '0' .. '9' | '_' | '-' -> true
  | _ -> false

let is_valid db_name =
  let len = String.length db_name in
  len > 0 && len <= 64 && String.for_all is_allowed_char db_name

let validate db_name = if is_valid db_name then Ok db_name else Error error_message
