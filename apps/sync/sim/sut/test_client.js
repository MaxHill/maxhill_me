import {
  ClientState,
  Lifecycle,
  newDatabase,
  OperationLog,
  RowStore,
  Sync,
} from "../../../../packages/idb-distribute/dist/index.js";
import readline from "node:readline";
import "fake-indexeddb/auto";

/* TODO: These should be taken from idb-distribute */
const OPERATIONS_STORE = "operations";
const CLIENT_STATE_STORE = "clientState";

if (!process.argv[0]) throw new Error("No database name provided");
process.stderr.write(`DB_name: ${process.argv[2]}\n`);
let testLifecycle = new Lifecycle([]);
const clientState = new ClientState();
const rowStore = new RowStore(testLifecycle.indexes);
const operationLog = new OperationLog();
const syncManager = new Sync(
  clientState,
  rowStore,
  operationLog,
  undefined,
  undefined,
);
const db = await newDatabase(process.argv[2])
  .withCustomStorageRepository(testLifecycle)
  .withCustomSync(syncManager)
  .addTable("posts", {})
  .addTable("users", {})
  .build()
  .open();

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

rl.on("line", async (line) => {
  const [type, data] = JSON.parse(line);

  switch (type) {
    case "Create_user": {
      assert(
        typeof data.name === "string",
        "Create_user data.name is not a string: " + data.name,
      );
      assert(
        typeof data.key === "string",
        "Create_user data.key is not a string: " + data.key,
      );
      await db.table("users").setRow("id", { key: data.key, name: data.name });
      for await (const user of db.table("users").query()) {
        console.error(user);
      }

      // Send sync request
      const tx = testLifecycle.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
      const syncRequest = await syncManager.createSyncRequest(tx);
      send("SyncRequest", syncRequest);

      return;
    }
    case "Create_post": {
      assert(
        typeof data.title === "string",
        "Create_post data.title is not a string: " + data.title,
      );
      assert(
        typeof data.key === "string",
        "Create_user data.key is not a string: " + data.key,
      );
      await db.table("posts").setRow("id", { key: data.key, title: data.title });
      for await (const posts of db.table("posts").query()) {
        console.error(posts);
      }
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
