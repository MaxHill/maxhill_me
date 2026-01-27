// Setup fake IndexedDB globals (Deno doesn't have native IndexedDB)
import "./setup-indexeddb.ts";

// @deno-types="npm:@types/seedrandom@^3.0.8"
import seedrandom from "seedrandom";
import { TextLineStream } from "@std/streams/text-line-stream";
import { type IDBPTransaction } from "idb";
import {
  createSyncRequest,
  applySyncResponse,
  type InternalDbSchema,
} from "@maxhill/idb-distribute";
import {
  newClient,
  Post,
  randomUUID,
  shuffleArray,
  User,
} from "./helpers.ts";

//  ------------------------------------------------------------------------
//  Types
//  ------------------------------------------------------------------------
type ActionRequest = {
  writeUser: boolean;
  deleteUser: boolean;
  clearUser: boolean;
  writePost: boolean;
  deletePost: boolean;
  clearPost: boolean;
  requestSync: boolean;
};

type SyncDeliveryRequest = {
  syncRequest: any;
  syncResponse: any;
};

type StateResponse = {
  crdtOperations: any[];
  clockValue: number;
  syncRequest?: any;
  actionTimeMs?: number;
  operationsReceiveTimeMs?: number;
  syncPrepTimeMs?: number;
};

type Message = {
  type: string;
  payload: any;
};

//  ------------------------------------------------------------------------
//  Setup database
//  ------------------------------------------------------------------------
const seed = Deno.args[0];
if (!seed) {
  throw new Error("No seed received");
}
const prng = seedrandom(seed);
const client = await newClient(prng);

//  ------------------------------------------------------------------------
//  Store last sync request for delivery
//  ------------------------------------------------------------------------
let lastSyncRequest: any = null;

//  ------------------------------------------------------------------------
//  Communicate with go
//  ------------------------------------------------------------------------
const lines = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream());

for await (const line of lines) {
  try {
    const { type, payload } = JSON.parse(line) as Message;

    let result: StateResponse;
    if (type === "action") {
      result = await handleAction(payload as ActionRequest);
    } else if (type === "sync_delivery") {
      result = await handleSyncDelivery(payload as SyncDeliveryRequest);
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }

    console.log(JSON.stringify({ result }));
  } catch (err) {
    console.log(JSON.stringify({ error: String(err) }));
  }
}

//  ------------------------------------------------------------------------
//  Handle action request
//  ------------------------------------------------------------------------
async function handleAction(request: ActionRequest): Promise<StateResponse> {
  const actionStart = performance.now();

  // Perform actions based on booleans
  if (request.writeUser) await writeUser(prng);
  if (request.deleteUser) await deleteUser(prng);
  if (request.clearUser) await clearUser();
  if (request.writePost) await writePost(prng);
  if (request.deletePost) await deletePost(prng);
  if (request.clearPost) await clearPost();

  const actionTimeMs = performance.now() - actionStart;

  // Get current CRDT operations
  const tx = client.db.transaction("_wal") as unknown as IDBPTransaction<
    InternalDbSchema,
    ["_wal", ...[]],
    "readwrite" | "readonly"
  >;
  const crdtOperations = await client.wal.getOperations(0, tx);
  await tx.done;

  // Get clock value directly from IndexedDB
  const clockTx = client.db.transaction(["_logicalClock"], "readonly");
  const clockStore = clockTx.objectStore("_logicalClock");
  const clockValue = (await clockStore.get("value")) ?? -1;
  await clockTx.done;

  // Optionally compute sync request
  let syncRequest = undefined;
  let syncPrepTimeMs = undefined;
  if (request.requestSync) {
    const syncPrepStart = performance.now();
    syncRequest = await createSyncRequest(client.realDb as any, client.wal);
    syncPrepTimeMs = performance.now() - syncPrepStart;
    lastSyncRequest = syncRequest; // Store for later delivery
  }

  return { 
    crdtOperations, 
    clockValue, 
    syncRequest,
    actionTimeMs,
    syncPrepTimeMs
  };
}

//  ------------------------------------------------------------------------
//  Handle sync delivery
//  ------------------------------------------------------------------------
async function handleSyncDelivery(
  request: SyncDeliveryRequest,
): Promise<StateResponse> {
  const operationsReceiveStart = performance.now();

  // Apply sync response to client using realDb (non-proxied)
  await applySyncResponse(
    client.realDb as any,
    client.wal,
    request.syncRequest,
    request.syncResponse,
  );

  const operationsReceiveTimeMs = performance.now() - operationsReceiveStart;

  // Get updated CRDT operations
  const crdtTx = client.db.transaction("_wal") as unknown as IDBPTransaction<
    InternalDbSchema,
    ["_wal", ...[]],
    "readwrite" | "readonly"
  >;
  const crdtOperations = await client.wal.getOperations(0, crdtTx);
  await crdtTx.done;

  // Get updated clock value
  const clockTx = client.db.transaction(["_logicalClock"], "readonly");
  const clockStore = clockTx.objectStore("_logicalClock");
  const clockValue = (await clockStore.get("value")) ?? -1;
  await clockTx.done;

  return { 
    crdtOperations, 
    clockValue, 
    syncRequest: undefined,
    operationsReceiveTimeMs
  };
}

//  ------------------------------------------------------------------------
//  Actions
//  ------------------------------------------------------------------------
async function writePost(prng: seedrandom.PRNG) {
  const id = randomUUID(prng);
  const tx = client.db.transaction(["posts"], "readwrite");
  const store = tx.objectStore("posts");
  const returnedId = await store.put({
    id,
    content: "This is a post",
  });
  await tx.done;
  if (id !== returnedId) {
    throw new Error("put user id not returned to be the same");
  }
}

async function deletePost(prng: seedrandom.PRNG) {
  const posts: Post[] = await client.db.getAll("posts");
  const [selected] = shuffleArray(prng, posts);
  if (selected) {
    await client.db.delete("posts", selected.id);
  }
}

async function clearPost() {
  await client.db.clear("posts");
}

async function writeUser(prng: seedrandom.PRNG) {
  const id = Math.floor(prng() * 100000000);
  const returnedId = await client.db.put("users", {
    id,
    name: "Test user",
  }, id);
  if (id !== returnedId) {
    throw new Error("put user id not returned to be the same");
  }
}

async function deleteUser(prng: seedrandom.PRNG) {
  const users: User[] = await client.db.getAll("users");
  const [selected] = shuffleArray(prng, users);
  if (selected) {
    await client.db.delete("users", selected.id);
  }
}

async function clearUser() {
  await client.db.clear("users");
}
