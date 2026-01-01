// Setup fake IndexedDB globals (Deno doesn't have native IndexedDB)
import "./setup-indexeddb.ts";

// @deno-types="npm:@types/seedrandom@^3.0.8"
import seedrandom from "seedrandom";
import { TextLineStream } from "@std/streams/text-line-stream";
import { type IDBPTransaction } from "idb";
import {
  newClient,
  Post,
  randomChance,
  randomInt,
  randomUUID,
  shuffleArray,
  User,
} from "./helpers.ts";
import { type InternalDbSchema } from "@maxhill/idb-distribute";

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
//  Communicate with go
//  ------------------------------------------------------------------------
const lines = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TextLineStream());

for await (const line of lines) {
  try {
    const { payload } = JSON.parse(line);

    const result = await tick(payload);

    console.log(JSON.stringify({ result }));
  } catch (err) {
    console.log(JSON.stringify({ error: String(err) }));
  }
}

//  ------------------------------------------------------------------------
//  Do one simulation run
//  ------------------------------------------------------------------------
async function tick(payload: { n: number }) {
  if (!payload) return [];

  // User action
  let chance = randomChance(prng, .3);
  if (chance) await writeUser(prng);

  chance = randomChance(prng, .3);
  if (chance) await deleteUser(prng);

  chance = randomChance(prng, .1);
  if (chance) await clearUser();

  // Posts action
  chance = randomChance(prng, .3);
  if (chance) await writePost(prng);

  chance = randomChance(prng, .3);
  if (chance) await deletePost(prng);

  chance = randomChance(prng, .1);
  if (chance) await clearPost();

  // Return wal to go process
  const tx2 = client.db.transaction("_wal") as unknown as IDBPTransaction<
    InternalDbSchema,
    ["_wal", ...[]],
    "readwrite" | "readonly"
  >;
  const walEntries = await client.wal.getEntries(0, tx2);
  await tx2.done;

  const syncRequest = await client.wal.getEntriesToSync(client.db);

  return { walEntries, syncRequest };
}

//  ------------------------------------------------------------------------
//  Actions
//  ------------------------------------------------------------------------
async function writePost(prng: seedrandom.PRNG) {
  console.error("writePost");
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
  console.error("deletePost");
  const posts: Post[] = await client.db.getAll("posts");
  const [selected] = shuffleArray(prng, posts);
  if (selected) {
    await client.db.delete("posts", selected.id);
  }
}

async function clearPost() {
  console.error("clearPost");
  await client.db.clear("posts");
}

async function writeUser(prng: seedrandom.PRNG) {
  console.error("writeUser");
  const id = randomInt(prng, 0, 100000000);
  const returnedId = await client.db.put("users", {
    id,
    name: "Test user",
  }, id);
  if (id !== returnedId) {
    throw new Error("put user id not returned to be the same");
  }
}

async function deleteUser(prng: seedrandom.PRNG) {
  console.error("deleteUser");
  const users: User[] = await client.db.getAll("users");
  const [selected] = shuffleArray(prng, users);
  if (selected) {
    await client.db.delete("users", selected.id);
  }
}

async function clearUser() {
  console.error("clearUser");
  await client.db.clear("users");
}
