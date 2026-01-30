// Setup fake IndexedDB globals (Deno doesn't have native IndexedDB)
import "./setup-indexeddb.ts";

// @deno-types="npm:@types/seedrandom@^3.0.8"
import seedrandom from "seedrandom";
import { TextLineStream } from "@std/streams/text-line-stream";
import {
  CLIENT_STATE_STORE,
  OPERATIONS_STORE,
  ROWS_STORE,
} from "../../../../packages/idb-distribute/src/IDBRepository.ts";
import type {
  SyncRequest,
  SyncResponse,
} from "../../../../packages/idb-distribute/src/sync/index.ts";
import type { CRDTOperation } from "../../../../packages/idb-distribute/src/crdt.ts";
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
  rows?: {
    [table: string]: {
      [rowKey: string]: Record<string, any>;
    };
  };
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
    } else if (type === "get_all_ops") {
      result = await handleGetAllOps();
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }

    console.log(JSON.stringify({ result }));
  } catch (err) {
    console.log(JSON.stringify({ error: String(err) }));
  }
}

//  ------------------------------------------------------------------------
//  Handle get all operations (for verification)
//  ------------------------------------------------------------------------
async function handleGetAllOps(): Promise<StateResponse> {
  // Get all CRDT operations (for convergence verification)
  const opsTx = client.repo.transaction([OPERATIONS_STORE], "readonly");
  const crdtOperations = await client.repo.getAllOperations(opsTx);
  // Readonly transaction - no need to explicitly wait for completion

  // Get clock value
  const clockTx = client.repo.transaction([CLIENT_STATE_STORE], "readonly");
  const clockValue = await client.repo.getVersion(clockTx);
  // Readonly transaction - no need to explicitly wait for completion

  // Get all materialized rows for verification
  const users = await client.crdtDb.getAllRows("users");
  const posts = await client.crdtDb.getAllRows("posts");

  // Convert Map to plain object for JSON serialization
  const rows = {
    users: Object.fromEntries(
      Array.from(users.entries()).map(([key, value]) => [String(key), value])
    ),
    posts: Object.fromEntries(
      Array.from(posts.entries()).map(([key, value]) => [String(key), value])
    ),
  };

  return {
    crdtOperations,
    clockValue,
    rows,
  };
}

//  ------------------------------------------------------------------------
//  Handle action request
//  ------------------------------------------------------------------------
async function handleAction(request: ActionRequest): Promise<StateResponse> {
  const actionStart = performance.now();
  const timings: Record<string, number> = {};

  // Perform actions based on booleans
  const writeStart = performance.now();
  if (request.writeUser) await writeUser(prng);
  if (request.deleteUser) await deleteUser(prng);
  if (request.writePost) await writePost(prng);
  if (request.deletePost) await deletePost(prng);
  timings.writes = performance.now() - writeStart;

  const actionTimeMs = performance.now() - actionStart;

  // Get count of unsynced operations (for logging only - don't fetch all operations)
  const opsStart = performance.now();
  const opsTx = client.repo.transaction([OPERATIONS_STORE], "readonly");
  const unsyncedCount = await client.repo.countUnsyncedOperations(opsTx);
  timings.getOps = performance.now() - opsStart;
  // Readonly transaction - no need to explicitly wait for completion

  // Get clock value
  const clockStart = performance.now();
  const clockTx = client.repo.transaction([CLIENT_STATE_STORE], "readonly");
  const clockValue = await client.repo.getVersion(clockTx);
  timings.getClock = performance.now() - clockStart;
  // Readonly transaction - no need to explicitly wait for completion

  // Optionally compute sync request
  let syncRequest: SyncRequest | undefined = undefined;
  let syncPrepTimeMs = undefined;
  if (request.requestSync) {
    const syncPrepStart = performance.now();
    const syncTx = client.repo.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE], "readonly");
    syncRequest = await client.sync.createSyncRequest(syncTx);
    // Readonly transaction - no need to explicitly wait for completion
    syncPrepTimeMs = performance.now() - syncPrepStart;
    timings.syncPrep = syncPrepTimeMs;
  }

  // Log if action took longer than 5 seconds
  const totalTime = performance.now() - actionStart;
  if (totalTime > 5000) {
    console.error(`SLOW ACTION: ${totalTime.toFixed(0)}ms total`, {
      writes: timings.writes?.toFixed(0) + "ms",
      getOps: timings.getOps?.toFixed(0) + "ms",
      getClock: timings.getClock?.toFixed(0) + "ms",
      syncPrep: timings.syncPrep?.toFixed(0) + "ms",
      unsyncedOps: unsyncedCount,
    });
  }

  return {
    crdtOperations: new Array(unsyncedCount), // Array with correct length but no actual data
    clockValue,
    syncRequest,
    actionTimeMs,
    syncPrepTimeMs,
  };
}

//  ------------------------------------------------------------------------
//  Handle sync delivery
//  ------------------------------------------------------------------------
async function handleSyncDelivery(
  request: SyncDeliveryRequest,
): Promise<StateResponse> {
  const operationsReceiveStart = performance.now();

  // Apply sync response to client
  const tx = client.repo.transaction(
    [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE],
    "readwrite",
  );
  await client.sync.handleSyncResponse(tx, client.clock, request.syncResponse);
  // Transaction auto-completes when all requests finish

  const operationsReceiveTimeMs = performance.now() - operationsReceiveStart;

  // Get updated CRDT operations (unsynced for state tracking)
  const opsTx = client.repo.transaction([OPERATIONS_STORE], "readonly");
  const crdtOperations = await client.repo.getUnsyncedOperations(opsTx);
  // Readonly transaction - no need to explicitly wait for completion

  // Get updated clock value
  const clockTx = client.repo.transaction([CLIENT_STATE_STORE], "readonly");
  const clockValue = await client.repo.getVersion(clockTx);
  // Readonly transaction - no need to explicitly wait for completion

  return {
    crdtOperations,
    clockValue,
    operationsReceiveTimeMs,
  };
}

//  ------------------------------------------------------------------------
//  Actions
//  ------------------------------------------------------------------------
async function writePost(prng: seedrandom.PRNG) {
  const id = randomUUID(prng);
  await client.crdtDb.setRow("posts", id, {
    id,
    content: "This is a post",
  });
}

async function deletePost(prng: seedrandom.PRNG) {
  const posts = await client.crdtDb.getAllRows("posts");
  const postKeys = Array.from(posts.keys()).filter(
    (key): key is string => typeof key === "string",
  );
  const [selected] = shuffleArray(prng, postKeys);
  if (selected !== undefined) {
    await client.crdtDb.deleteRow("posts", selected);
  }
}

async function writeUser(prng: seedrandom.PRNG) {
  const id = Math.floor(prng() * 100000000);
  await client.crdtDb.setRow("users", String(id), {
    id,
    name: "Test user",
  });
}

async function deleteUser(prng: seedrandom.PRNG) {
  const users = await client.crdtDb.getAllRows("users");
  const userKeys = Array.from(users.keys()).filter(
    (key): key is string => typeof key === "string",
  );
  const [selected] = shuffleArray(prng, userKeys);
  if (selected !== undefined) {
    await client.crdtDb.deleteRow("users", selected);
  }
}
