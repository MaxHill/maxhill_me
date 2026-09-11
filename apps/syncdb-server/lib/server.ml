type response = { status : Httpun.Status.t; body : string }
type response_format = [ `Text | `Json ]

type context = {
  db_pool : Repository.pool;
  auth : Auth.t;
  event_hub : Event_hub.t;
  clock : float Eio.Time.clock_ty Eio.Std.r;
}

(* Comment frames while blocked on hub await. 15s is enough for typical proxy
   idle limits; same-clientId replace already clears HMR/reconnect zombies. *)
let sse_keepalive_seconds = 15.0
let sse_keepalive_frame = ": keepalive\n\n"

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

let cors_headers =
  [
    ("access-control-allow-origin", "*");
    ("access-control-allow-methods", "GET,POST,OPTIONS");
    ("access-control-allow-headers", "authorization,content-type");
  ]

let json_error_body message =
  Yojson.Safe.to_string (`Assoc [ ("error", `String message) ])

let respond_with_content_type reqd ~content_type ({ status; body } : response) =
  let headers =
    Httpun.Headers.of_list
      (cors_headers
      @ [
          ("content-type", content_type);
          ("content-length", string_of_int (String.length body));
        ])
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

let subscribe_db_name path =
  match String.split_on_char '/' path with
  | [ ""; "subscribe"; db_name ] when db_name <> "" -> Some db_name
  | _ -> None

let encode_sse_event = function
  | Event_hub.Upstream_change -> "event: upstreamChange\ndata: {}\n\n"

let write_sse_frame body_writer frame =
  let flushed, resolve = Eio.Promise.create () in
  Httpun.Body.Writer.write_string body_writer frame;
  Httpun.Body.Writer.flush body_writer (function
    | `Written -> Eio.Promise.resolve resolve `Written
    | `Closed -> Eio.Promise.resolve resolve `Closed);
  Eio.Promise.await flushed

let handle_subscribe (context : context) reqd request uri db_name =
  let authorization = Httpun.Headers.get request.Httpun.Request.headers "authorization" in
  match Auth.validate_bearer context.auth authorization with
  | Error err ->
      let msg = Auth.error_to_string err in
      Log.err (fun m -> m "subscribe auth error: %s" msg);
      respond_json reqd
        { status = `Unauthorized; body = json_error_body msg }
  | Ok user -> (
      match Db_name.validate db_name with
      | Error msg ->
          respond_json reqd { status = `Bad_request; body = json_error_body msg }
      | Ok db_name -> (
          match Uri.get_query_param uri "clientId" with
          | None | Some "" ->
              respond_json reqd
                {
                  status = `Bad_request;
                  body = json_error_body "missing clientId query parameter";
                }
          | Some client_id -> (
              match
                Event_hub.subscribe context.event_hub ~user_id:user.id ~db_name
                  ~client_id
              with
              | Error `At_capacity ->
                  Log.warn (fun m ->
                      m
                        "subscribe at capacity user_id=%s db_name=%s client_id=%s"
                        user.id db_name client_id);
                  respond_json reqd
                    {
                      status = `Too_many_requests;
                      body = json_error_body "too many subscribers";
                    }
              | Ok sub ->
                  let headers =
                    Httpun.Headers.of_list
                      (cors_headers
                      @ [
                          ("content-type", "text/event-stream; charset=utf-8");
                          ("cache-control", "no-cache");
                          ("connection", "keep-alive");
                        ])
                  in
                  let response = Httpun.Response.create ~headers `OK in
                  let body_writer =
                    Httpun.Reqd.respond_with_streaming
                      ~flush_headers_immediately:true reqd response
                  in
                  let close_stream () =
                    Event_hub.unsubscribe context.event_hub sub;
                    Httpun.Body.Writer.close body_writer
                  in
                  let rec loop () =
                    match
                      Eio.Fiber.first
                        (fun () -> `Hub (Event_hub.await sub))
                        (fun () ->
                          Eio.Time.sleep context.clock sse_keepalive_seconds;
                          `Keepalive)
                    with
                    | `Hub None -> close_stream ()
                    | `Hub (Some event) -> (
                        match
                          write_sse_frame body_writer (encode_sse_event event)
                        with
                        | `Written -> loop ()
                        | `Closed -> close_stream ())
                    | `Keepalive -> (
                        match write_sse_frame body_writer sse_keepalive_frame with
                        | `Written -> loop ()
                        | `Closed -> close_stream ())
                  in
                  match
                    try Ok (loop ()) with
                    | exn ->
                        Event_hub.unsubscribe context.event_hub sub;
                        Error exn
                  with
                  | Ok () -> ()
                  | Error exn ->
                      Httpun.Body.Writer.close body_writer;
                      raise exn)))

let request_handler (context : context) _client_addr reqd =
  let reqd = reqd.Gluten.Reqd.reqd in
  let request = Httpun.Reqd.request reqd in
  let meth = request.meth in
  let target = request.target in
  let uri = Uri.of_string target in
  let path = Uri.path uri in
  Log.info (fun m -> m "%s %s" (Httpun.Method.to_string meth) target);
  match (meth, path) with
  | `OPTIONS, "/sync" ->
      respond_text reqd { status = `No_content; body = "" }
  | `OPTIONS, path when Option.is_some (subscribe_db_name path) ->
      respond_text reqd { status = `No_content; body = "" }
  | `POST, "/sync" -> (
      let authorization = Httpun.Headers.get request.headers "authorization" in
      match Auth.validate_bearer context.auth authorization with
      | Error err ->
          let msg = Auth.error_to_string err in
          Log.err (fun m -> m "auth error: %s" msg);
          respond_text reqd { status = `Unauthorized; body = msg }
      | Ok user ->
          read_request_body reqd (fun body ->
              let result =
                let* sync_request =
                  Sync_engine.decode_sync_request body
                  |> Result.map_error (fun msg -> `Decode msg)
                in
                let tenant_key = sync_request.db_name ^ ":" ^ user.id in
                let* response_or_error =
                  Caqti_eio.Pool.use
                    (fun conn ->
                      Ok
                        (Sync_engine.process_sync_request_with_connection conn
                           ~db_name:tenant_key sync_request))
                    context.db_pool
                  |> Result.map_error (fun err -> `Db err)
                in
                let* response =
                  response_or_error |> Result.map_error (fun err -> `Sync err)
                in
                Ok (sync_request, response)
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
              | Ok (sync_request, response) ->
                  if sync_request.operations <> [] then
                    Event_hub.publish context.event_hub ~user_id:user.id
                      ~db_name:sync_request.db_name
                      ~exclude_client_id:sync_request.client_id
                      Event_hub.Upstream_change;
                  respond_json reqd
                    {
                      status = `OK;
                      body = Sync_engine.encode_sync_response response;
                    }))
  | `GET, path -> (
      match subscribe_db_name path with
      | Some db_name -> handle_subscribe context reqd request uri db_name
      | None -> respond_by_format reqd (route ~meth ~target:path))
  | _ -> respond_by_format reqd (route ~meth ~target:path)

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
    Httpun.Headers.of_list
      (cors_headers @ [ ("content-type", "text/plain; charset=utf-8") ])
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
