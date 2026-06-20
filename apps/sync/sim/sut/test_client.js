const readline = require("node:readline");

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

const send = (...msg) => {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
};

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

rl.on("line", (line) => {
  const [type, data] = JSON.parse(line);

  switch (type) {
    case "Ping": {
      assert(
        typeof data.step === "number",
        "Ping data.step is not a number: " + data.step,
      );
      send("Pong");
      return;
    }
    case "Close": {
      process.stderr.write("Closing...\n");
      process.exit(0);
    }
    default: {
      throw new Error(`Received unknown message. type: ${type} data: ${data}`);
    }
  }
});
