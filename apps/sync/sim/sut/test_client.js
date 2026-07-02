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

const dbName = process.argv[2];
const deterministicClientId = `sim-client-${dbName}`;

const db = await newDatabase(dbName)
  .withCustomStorageRepository(testLifecycle)
  .withCustomSync(syncManager)
  .withCustomIdGenerator(() => deterministicClientId)
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

async function handleLine(line) {
  const [type, data] = JSON.parse(line);

  switch (type) {
    case "Query_user_msg": {
      let it = db.table("users").query();
      for await (const _ of it) {}
      send("Ack");
      return;
    }
    case "Query_post_msg": {
      let it = db.table("posts").query();
      for await (const _ of it) {}
      send("Ack");
      return;
    }
    case "Create_user_msg": {
      assert(
        typeof data.name === "string",
        "Create_user data.name is not a string: " + data.name,
      );
      assert(
        typeof data.key === "string",
        "Create_user data.key is not a string: " + data.key,
      );
      await db.table("users").setRow(data.key, { key: data.key, name: data.name });
      send("Ack");
      return;
    }
    case "Create_post_msg": {
      assert(
        typeof data.title === "string",
        "Create_post data.title is not a string: " + data.title,
      );
      assert(
        typeof data.key === "string",
        "Create_user data.key is not a string: " + data.key,
      );
      await db.table("posts").setRow(data.key, { key: data.key, title: data.title });
      send("Ack");
      return;
    }
    case "Send_sync_request_msg": {
      const tx = testLifecycle.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
      const syncRequest = await syncManager.createSyncRequest(tx);
      send("SyncRequest", syncRequest);
      return;
    }
    case "Receive_sync_response_msg": {
      const syncResponse = typeof data === "string" ? JSON.parse(data) : data;
      await db.sync(syncResponse);
      send("Ack");
      return;
    }
    case "Close_msg": {
      process.stderr.write("Closing...\n");
      process.exit(0);
    }
    default: {
      throw new Error(`Received unknown message. type: ${type} data: ${data}`);
    }
  }
}

rl.on("line", async (line) => {
  try {
    await handleLine(line);
  } catch (err) {
    const msg = err && err.stack ? err.stack : String(err);
    process.stderr.write(`CLIENT_FATAL: ${msg}\n`);
    process.exit(1);
  }
});

process.on("unhandledRejection", (err) => {
  const msg = err && err.stack ? err.stack : String(err);
  process.stderr.write(`CLIENT_UNHANDLED_REJECTION: ${msg}\n`);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  const msg = err && err.stack ? err.stack : String(err);
  process.stderr.write(`CLIENT_UNCAUGHT_EXCEPTION: ${msg}\n`);
  process.exit(1);
});
