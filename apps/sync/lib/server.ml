type response = { status : Httpun.Status.t; body : string }
type response_format = [ `Text | `Json ]
type context = { db_pool : Repository.pool; auth : Auth.t }

let ( let* ) = Result.bind

let src = Logs.Src.create "sync.server"

module Log = (val Logs.src_log src : Logs.LOG)

let status_of_sync_error = function
  | Sync_engine.Request_integrity_failed
  | Sync_engine.Client_state_out_of_sync _
  | Sync_engine.Non_contiguous_versions _
  | Sync_engine.Remove_context_unseen_dot _ ->
      `Bad_request
  | Sync_engine.Storage_error _ | Sync_engine.Decode_error _ ->
      `Internal_server_error

let route ~meth ~target =
  match (meth, target) with
  | `GET, "/health" -> ({ status = `OK; body = "ok" }, `Text)
  | _ -> ({ status = `Not_found; body = "not found" }, `Text)

let respond_with_content_type reqd ~content_type ({ status; body } : response) =
  let headers =
    Httpun.Headers.of_list
      [
        ("content-type", content_type);
        ("content-length", string_of_int (String.length body));
      ]
  in
  let response = Httpun.Response.create ~headers status in
  Httpun.Reqd.respond_with_string reqd response body

let respond_text reqd response =
  respond_with_content_type reqd ~content_type:"text/plain; charset=utf-8"
    response

let respond_json reqd response =
  respond_with_content_type reqd ~content_type:"application/json" response

let respond_by_format reqd (response, format) =
  match format with
  | `Json -> respond_json reqd response
  | `Text -> respond_text reqd response

let read_request_body reqd on_body =
  let body_reader = Httpun.Reqd.request_body reqd in
  let buffer = Buffer.create 128 in
  let rec loop () =
    Httpun.Body.Reader.schedule_read body_reader
      ~on_eof:(fun () -> on_body (Buffer.contents buffer))
      ~on_read:(fun bs ~off ~len ->
        Buffer.add_string buffer (Bigstringaf.substring bs ~off ~len);
        loop ())
  in
  loop ()

let request_handler (context : context) _client_addr reqd =
  let reqd = reqd.Gluten.Reqd.reqd in
  let request = Httpun.Reqd.request reqd in
  let meth = request.meth in
  let target = request.target in
  Log.info (fun m -> m "%s %s" (Httpun.Method.to_string meth) target);
  match (meth, target) with
  | `GET, "/debug/count" -> (
      match Repository.count_operations_with_pool context.db_pool with
      | Ok count ->
          let body = Printf.sprintf "{\"count\": %d}" count in
          respond_json reqd { status = `OK; body }
      | Error err ->
          Log.err (fun m ->
              m "count_operations failed: %s" (Repository.error_to_string err));
          respond_text reqd
            { status = `Internal_server_error; body = "internal server error" })
  | `POST, "/sync" -> (
      let authorization = Httpun.Headers.get request.headers "authorization" in
      match Auth.validate_bearer context.auth authorization with
      | Error err ->
          let msg = Auth.error_to_string err in
          Log.err (fun m -> m "auth error: %s" msg);
          respond_text reqd { status = `Unauthorized; body = msg }
      | Ok _user ->
          read_request_body reqd (fun body ->
              let result =
                let* request =
                  Sync_engine.decode_sync_request body
                  |> Result.map_error (fun msg -> `Decode msg)
                in
                let* response_or_error =
                  Caqti_eio.Pool.use
                    (fun conn ->
                      Ok
                        (Sync_engine.process_sync_request_with_connection conn
                           request))
                    context.db_pool
                  |> Result.map_error (fun err -> `Db err)
                in
                response_or_error |> Result.map_error (fun err -> `Sync err)
              in
              match result with
              | Error (`Decode msg) ->
                  Log.err (fun m -> m "sync decode error: %s" msg);
                  respond_text reqd { status = `Bad_request; body = msg }
              | Error (`Db err) ->
                  Log.err (fun m -> m "sync db error: %s" (Caqti_error.show err));
                  respond_text reqd
                    {
                      status = `Internal_server_error;
                      body = "internal server error";
                    }
              | Error (`Sync err) ->
                  let msg = Sync_engine.sync_error_to_string err in
                  Log.err (fun m -> m "sync process error: %s" msg);
                  respond_text reqd
                    { status = status_of_sync_error err; body = msg }
              | Ok response ->
                  respond_json reqd
                    {
                      status = `OK;
                      body = Sync_engine.encode_sync_response response;
                    }))
  | _ -> respond_by_format reqd (route ~meth ~target)

let error_handler _client_addr ?request:_ error handle =
  let body =
    match error with
    | `Bad_request -> "bad request"
    | `Bad_gateway -> "bad gateway"
    | `Internal_server_error -> "internal server error"
    | `Exn exn ->
        Log.err (fun m -> m "uncaught handler exception: %a" Fmt.exn exn);
        "internal server error"
  in
  let headers =
    Httpun.Headers.of_list [ ("content-type", "text/plain; charset=utf-8") ]
  in
  let response_body = handle headers in
  Httpun.Body.Writer.write_string response_body body;
  Httpun.Body.Writer.close response_body

let start env ~sw ~port ~context =
  let net = Eio.Stdenv.net env in
  let socket =
    Eio.Net.listen net ~sw ~reuse_addr:true ~reuse_port:true ~backlog:128
      (`Tcp (Eio.Net.Ipaddr.V4.any, port))
  in
  Log.info (fun m -> m "listening on :%d" port);
  let connection_handler =
    Httpun_eio.Server.create_connection_handler ~sw
      ~request_handler:(request_handler context) ~error_handler
  in
  Eio.Net.run_server socket ~on_error:raise (fun flow client_addr ->
      connection_handler client_addr flow)
