let () =
  let entropy = In_channel.input_all stdin in
  let frng = Sync_simulator.FRNG.init entropy in
  match Sync_simulator.World.init frng with
  | Error Sync_simulator.FRNG.Out_of_entropy ->
      (* not enough entropy to even start the world — innocent *)
      exit 0
  | Ok w ->
      Sync_simulator.World.run w;
      exit 0
