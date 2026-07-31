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
let testLifecycle = new Lifecycle([{ table: "users", name: "user_age_index", keys: ["age"] }]);
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
const clientSuffix = process.argv[3] || dbName;
const deterministicClientId = `sim-client-${clientSuffix}`;

const db = await newDatabase(dbName)
  .withCustomStorageRepository(testLifecycle)
  .withCustomSync(syncManager)
  .withClientId(deterministicClientId)
  .addTable("posts", {})
  .addTable("users", { user_age_index: ["age"] })
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
    case "Query_msg": {
      const target = typeof data === "string" ? data.toLowerCase() : String(data).toLowerCase();
      if (target === "users") {
        const it = db.table("users").query();
        for await (const _ of it) {}
      } else if (target === "posts") {
        const it = db.table("posts").query();
        for await (const _ of it) {}
      } else if (target === "user_age_index") {
        const it = db.table("users").index("user_age_index").query();
        for await (const _ of it) {}
      } else {
        throw new Error(`Unknown Query_msg target: ${data}`);
      }
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
      assert(
        typeof data.age === "number" && Number.isInteger(data.age),
        "Create_user data.age is not an integer: " + data.age,
      );
      await db.table("users").setRow(data.key, {
        key: data.key,
        name: data.name,
        age: data.age,
      });
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
    case "Delete_row_msg": {
      const table = typeof data.table === "string"
        ? data.table.toLowerCase()
        : String(data.table).toLowerCase();
      assert(typeof data.key === "string", "Delete_row data.key is not a string: " + data.key);
      if (table !== "users" && table !== "posts") {
        throw new Error(`Delete_row_msg unknown table: ${data.table}`);
      }
      await db.table(table).deleteRow(data.key);
      send("Ack");
      return;
    }
    case "Update_user_row_msg": {
      assert(typeof data.key === "string", "Update_user_row data.key is not a string: " + data.key);
      assert(
        typeof data.name === "string",
        "Update_user_row data.name is not a string: " + data.name,
      );
      assert(
        typeof data.age === "number" && Number.isInteger(data.age),
        "Update_user_row data.age is not an integer: " + data.age,
      );
      await db.table("users").setRow(data.key, { key: data.key, name: data.name, age: data.age });
      send("Ack");
      return;
    }
    case "Update_post_row_msg": {
      assert(typeof data.key === "string", "Update_post_row data.key is not a string: " + data.key);
      assert(
        typeof data.title === "string",
        "Update_post_row data.title is not a string: " + data.title,
      );
      await db.table("posts").setRow(data.key, { key: data.key, title: data.title });
      send("Ack");
      return;
    }
    case "Update_user_name_field_msg": {
      assert(
        typeof data.key === "string",
        "Update_user_name_field data.key is not a string: " + data.key,
      );
      assert(
        typeof data.name === "string",
        "Update_user_name_field data.name is not a string: " + data.name,
      );
      await db.table("users").setField(data.key, "name", data.name);
      send("Ack");
      return;
    }
    case "Update_user_age_field_msg": {
      assert(
        typeof data.key === "string",
        "Update_user_age_field data.key is not a string: " + data.key,
      );
      assert(
        typeof data.age === "number" && Number.isInteger(data.age),
        "Update_user_age_field data.age is not an integer: " + data.age,
      );
      await db.table("users").setField(data.key, "age", data.age);
      send("Ack");
      return;
    }
    case "Update_post_title_field_msg": {
      assert(
        typeof data.key === "string",
        "Update_post_title_field data.key is not a string: " + data.key,
      );
      assert(
        typeof data.title === "string",
        "Update_post_title_field data.title is not a string: " + data.title,
      );
      await db.table("posts").setField(data.key, "title", data.title);
      send("Ack");
      return;
    }
    case "Send_sync_request_msg": {
      const tx = testLifecycle.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
      const syncRequest = await syncManager.createSyncRequest(tx, dbName);
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
