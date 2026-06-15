const readline = require("node:readline");

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

const send = (...msg) => {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
};

rl.on("line", (line) => {
  const [type, data] = JSON.parse(line);
  if (type === "Ping" && typeof data.step === "number") {
    send("Pong");
    return;
  }

  if (type === "Close") {
    process.stderr.write("Closing...\n");
    process.exit(0);
  }

  throw new Error(`Received unknown message. type: ${type} data: ${data}`);
});
