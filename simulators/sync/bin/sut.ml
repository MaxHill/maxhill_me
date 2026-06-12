let () =
  let entropy = In_channel.input_all stdin in
  let frng = Sync_simulator.FRNG.init entropy in

  (* Printf.eprintf "sut: got %d bytes of entropy\n" (String.length entropy); *)
  ignore frng;

  if String.length entropy >= 50 then exit 1;
  (* Printf.eprintf "sut: pass at %d\n" (String.length entropy); *)
  exit 0
