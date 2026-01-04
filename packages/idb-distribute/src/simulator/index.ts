import "fake-indexeddb/auto";
import seedrandom from "seedrandom";
import * as helpers from "./helpers";
import { deepStrictEqual } from "node:assert";
import { dbQueries, type InternalDbSchema } from "../db";
import type { IDBPDatabase, IDBPTransaction } from "idb";

//  ------------------------------------------------------------------------
//  Setup
//  ------------------------------------------------------------------------
// Get seed: env.SIMULATION_SEED
const seed = process.env["SIMULATION_SEED"];
if (!seed) {
  throw new Error("SIMULATION_SEED is not set");
}
const prng = seedrandom(seed);

const config = {
  iterations: 132, // 132
  addClientProbability: 0.3, // 30%
  writeProbability: 0.5, // 50%
  deleteProbability: 0.05, // 5%
  clearProbability: 0.02, // 2%
  tickProbability: 0.50, // 85%
};

//  ------------------------------------------------------------------------
//  Simulation
//  ------------------------------------------------------------------------
const clients: helpers.SimClient[] = [];
for (let i = 0; i < config.iterations; i++) {
  console.info("Iteration: ", i + 1);

  // Maybe add client
  if (helpers.randomChance(prng, config.addClientProbability)) {
    clients.push(await helpers.newClient(prng));
    console.log("Add client: #" + clients.length);
  }

  for (const client of clients) {
    // Maybe write
    if (helpers.randomChance(prng, config.writeProbability)) {
      // 50% chance write user or post
      const chance = helpers.randomInt(prng, 1, 2);
      if (chance === 1) {
        const id = helpers.randomUUID(prng);
        const tx = client.db.transaction(["posts"], "readwrite");
        const store = tx.objectStore("posts");
        const returnedId = await store.put({
          id,
          content: "This is a post",
        });
        await tx.done;
        deepStrictEqual(id, returnedId);
      } else if (chance === 2) {
        const id = helpers.randomInt(prng, 0, 100000000);
        const returnedId = await client.db.put("users", {
          id,
          name: "Test user",
        }, id);
        deepStrictEqual(id, returnedId);
      }

      // Maybe delete
      if (helpers.randomChance(prng, config.deleteProbability)) {
        // 50% chance delete user or post
        if (helpers.randomChance(prng, .5)) {
          const posts: helpers.Post[] = await client.db.getAll("posts");
          const [selected] = helpers.shuffleArray(prng, posts);
          if (selected) {
            await client.db.delete("posts", selected.id);
          }
        } else {
          const users: helpers.User[] = await client.db.getAll("users");
          const [selected] = helpers.shuffleArray(prng, users);
          if (selected) {
            await client.db.delete("users", selected.id);
          }
        }
      }

      // Maybe clear
      if (helpers.randomChance(prng, config.clearProbability)) {
        // 50% chance clear users or posts
        if (helpers.randomChance(prng, .5)) {
          await client.db.clear("posts");
        } else {
          await client.db.clear("users");
        }
      }

      // Maybe tick
      if (helpers.randomChance(prng, config.tickProbability)) {
        await client.scheduler.tick();
      }
    }
  }
}

//  Validation with proper convergence waiting
//  ------------------------------------------------------------------------

for (const client of clients) await client.scheduler.tick();
for (const client of clients) await client.scheduler.tick();

// Now validate that all clients have identical state
if (clients[0]) {
  console.log("========================Validate clients========================");

  const firstClient = clients[0];

  const tx = firstClient.db.transaction("_wal") as unknown as IDBPTransaction<
    InternalDbSchema,
    ["_wal", ...any[]],
    "readwrite" | "readonly"
  >;
  const firstClientWalOperations = await firstClient.wal.getOperations(0, tx);
  await tx.done;

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const tx = (client.db as unknown as IDBPDatabase<InternalDbSchema>).transaction(
      "_clientId",
      "readonly",
    );
    const clientId = await dbQueries.getClientIdTx(tx);
    await tx.done;
    console.log(`Validating client ${i + 1}/${clients.length} (${clientId})`);

    const tx2 = client.db.transaction("_wal") as unknown as IDBPTransaction<
      InternalDbSchema,
      ["_wal", ...any[]],
      "readwrite" | "readonly"
    >;
    const walOperations = await client.wal.getOperations(0, tx2);
    await tx2.done;

    // Length check
    if (walOperations.length !== firstClientWalOperations.length) {
      console.error(`Length mismatch for client ${clientId}:`, {
        expected: firstClientWalOperations.length,
        actual: walOperations.length,
      });
      throw new Error(`Length mismatch for client ${clientId}`);
    }

    // Order check
    const expectedKeyOrder = firstClientWalOperations.map((operation) => operation.key);
    const actualKeyOrder = walOperations.map((operation) => operation.key);

    for (let j = 0; j < expectedKeyOrder.length; j++) {
      if (expectedKeyOrder[j] !== actualKeyOrder[j]) {
        console.error(`Order mismatch for client ${clientId} at index ${j}:`);
        console.error(`Expected: ${expectedKeyOrder[j]}`);
        console.error(`Actual:   ${actualKeyOrder[j]}`);
        throw new Error(`Order mismatch for client ${clientId}`);
      }
    }

    // Content check (excluding serverVersion)
    for (let j = 0; j < walOperations.length; j++) {
      const expected = { ...firstClientWalOperations[j], serverVersion: 0 };
      const actual = { ...walOperations[j], serverVersion: 0 };

      try {
        deepStrictEqual(actual, expected);
      } catch (error) {
        console.error(`Content mismatch for client ${clientId} at index ${j}:`);
        console.error("Expected:", expected);
        console.error("Actual:", actual);
        throw error;
      }
    }

    // Validate projected content is correct
    const expectedUsers: helpers.User[] = await firstClient.db.getAll("users");
    const actualUsers: helpers.User[] = await client.db.getAll("users");
    deepStrictEqual(expectedUsers.length, actualUsers.length);
    deepStrictEqual(expectedUsers.sort(), actualUsers.sort());

    const expectedPosts: helpers.Post[] = await firstClient.db.getAll("posts");
    const actualPosts: helpers.Post[] = await client.db.getAll("posts");
    deepStrictEqual(expectedUsers.length, actualUsers.length);
    deepStrictEqual(expectedPosts.sort(), actualPosts.sort());

    console.log(`✓ Client ${clientId} validated successfully`);
  }
}
