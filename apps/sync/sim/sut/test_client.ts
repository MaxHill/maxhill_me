import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

const send = (msg: unknown) => {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
};

rl.on("line", (line) => {
  try {
    const message = JSON.parse(line) as { type?: string; step?: number };

    if (message.type === "step" && typeof message.step === "number") {
      send({ type: "ack", step: message.step });
      return;
    }

    if (message.type === "shutdown") {
      process.exit(0);
    }
  } catch {
    // ignore malformed messages in test client
  }
});
