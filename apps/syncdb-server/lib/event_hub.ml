type event = Upstream_change

type partition_key = string * string

type subscription = {
  partition_key : partition_key;
  client_id : string;
  queue : event Eio.Stream.t;
  closed : unit Eio.Promise.t;
  resolve_closed : unit Eio.Promise.u;
  mutable alive : bool;
}

type t = {
  mutex : Eio.Mutex.t;
  (* (tenant_id, db_name) -> live subscriptions *)
  subscribers : (partition_key, subscription list) Hashtbl.t;
}

let max_subscribers_per_tenant = 10

let partition_key ~tenant_id ~db_name =
  assert (String.length tenant_id > 0);
  assert (String.length db_name > 0);
  let key = (tenant_id, db_name) in
  assert (fst key = tenant_id);
  assert (snd key = db_name);
  key

let init () =
  let hub =
    { mutex = Eio.Mutex.create (); subscribers = Hashtbl.create 16 }
  in
  assert (Hashtbl.length hub.subscribers = 0);
  assert (max_subscribers_per_tenant > 0);
  assert (max_subscribers_per_tenant <= 100);
  assert (Hashtbl.length hub.subscribers = 0);
  hub

(** Mark [sub] dead and wake any [await]. Caller holds [t.mutex]. *)
let close_subscription_locked sub =
  if sub.alive then (
    sub.alive <- false;
    assert (not sub.alive);
    if not (Eio.Promise.is_resolved sub.closed) then
      Eio.Promise.resolve sub.resolve_closed ();
    assert (Eio.Promise.is_resolved sub.closed))
  else (
    (* Already closed — closed promise must already be resolved. *)
    assert (not sub.alive);
    assert (Eio.Promise.is_resolved sub.closed))

(** Drop prior connections for this client_id (reconnect / HMR). Holds mutex. *)
let take_after_dropping_client t key client_id =
  let tenant_id, db_name = key in
  assert (String.length tenant_id > 0);
  assert (String.length db_name > 0);
  assert (String.length client_id > 0);
  match Hashtbl.find_opt t.subscribers key with
  | None -> []
  | Some xs ->
      let keep, drop =
        List.partition (fun s -> s.client_id <> client_id) xs
      in
      List.iter close_subscription_locked drop;
      assert (List.for_all (fun s -> s.client_id <> client_id) keep);
      assert (List.length keep + List.length drop = List.length xs);
      if keep = [] then Hashtbl.remove t.subscribers key
      else Hashtbl.replace t.subscribers key keep;
      keep

let subscribe t ~tenant_id ~db_name ~client_id =
  assert (String.length client_id > 0);
  let key = partition_key ~tenant_id ~db_name in
  assert (fst key = tenant_id);
  assert (snd key = db_name);
  Eio.Mutex.use_rw ~protect:true t.mutex @@ fun () ->
  (* Same client reconnecting must not stack zombie SSE fibers. *)
  let existing = take_after_dropping_client t key client_id in
  let count = List.length existing in
  assert (List.for_all (fun sub -> sub.partition_key = key) existing);
  assert (count >= 0);
  assert (count <= max_subscribers_per_tenant);
  assert (List.for_all (fun s -> s.client_id <> client_id) existing);
  if count >= max_subscribers_per_tenant then Error `At_capacity
  else (
    assert (count < max_subscribers_per_tenant);
    (* Capacity 1 queue: coalesce wake-ups so publish never blocks on a slow SSE. *)
    let queue = Eio.Stream.create 1 in
    assert (Eio.Stream.length queue = 0);
    let closed, resolve_closed = Eio.Promise.create () in
    let sub =
      {
        partition_key = key;
        client_id;
        queue;
        closed;
        resolve_closed;
        alive = true;
      }
    in
    Hashtbl.replace t.subscribers key (sub :: existing);
    assert (List.length (Hashtbl.find t.subscribers key) = count + 1);
    assert sub.alive;
    assert (not (Eio.Promise.is_resolved sub.closed));
    Ok sub)

let unsubscribe t sub =
  Eio.Mutex.use_rw ~protect:true t.mutex @@ fun () ->
  if sub.alive then (
    close_subscription_locked sub;
    assert (not sub.alive);
    assert (Eio.Promise.is_resolved sub.closed);
    match Hashtbl.find_opt t.subscribers sub.partition_key with
    | None -> ()
    | Some xs ->
        let remaining = List.filter (fun s -> s != sub) xs in
        assert (List.length remaining < List.length xs || xs = []);
        assert (not (List.exists (fun s -> s == sub) remaining));
        assert (List.for_all (fun s -> s.partition_key = sub.partition_key) remaining);
        if remaining = [] then Hashtbl.remove t.subscribers sub.partition_key
        else Hashtbl.replace t.subscribers sub.partition_key remaining)
  else (
    assert (not sub.alive);
    assert (Eio.Promise.is_resolved sub.closed))

let await sub =
  assert (String.length sub.client_id > 0);
  let tenant_id, db_name = sub.partition_key in
  assert (String.length tenant_id > 0);
  assert (String.length db_name > 0);
  match
    Eio.Fiber.first
      (fun () -> `Event (Eio.Stream.take sub.queue))
      (fun () ->
        Eio.Promise.await sub.closed;
        `Closed)
  with
  | `Event event -> (
      match event with
      | Upstream_change ->
          (* Only variant today. Match keeps exhaustiveness when we add more. *)
          assert (String.length tenant_id > 0);
          assert (String.length db_name > 0);
          Some Upstream_change)
  | `Closed ->
      assert (Eio.Promise.is_resolved sub.closed);
      assert (not sub.alive || Eio.Promise.is_resolved sub.closed);
      None

let publish t ~tenant_id ~db_name ~exclude_client_id event =
  (match event with
  | Upstream_change ->
      assert (String.length tenant_id > 0);
      assert (String.length db_name > 0));
  let key = partition_key ~tenant_id ~db_name in
  let targets =
    Eio.Mutex.use_ro t.mutex @@ fun () ->
    match Hashtbl.find_opt t.subscribers key with
    | None -> []
    | Some xs ->
        List.filter
          (fun s -> s.alive && s.client_id <> exclude_client_id)
          xs
  in
  assert (List.for_all (fun s -> s.alive) targets);
  assert (List.for_all (fun s -> s.partition_key = key) targets);
  assert (List.for_all (fun s -> s.client_id <> exclude_client_id) targets);
  List.iter
    (fun s ->
      (* If a slot is free, enqueue; else a wake-up is already pending. *)
      let depth = Eio.Stream.length s.queue in
      assert (depth >= 0);
      assert (depth <= 1);
      if depth = 0 then Eio.Stream.add s.queue event)
    targets
