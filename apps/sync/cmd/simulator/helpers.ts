// @deno-types="npm:@types/seedrandom@^3.0.8"
import seedrandom from "seedrandom";
import { CRDTDatabase } from "../../../../packages/idb-distribute/src/crdtDatabase.ts";
import { IDBRepository } from "../../../../packages/idb-distribute/src/IDBRepository.ts";
import { Sync } from "../../../../packages/idb-distribute/src/sync/index.ts";
import { PersistedLogicalClock } from "../../../../packages/idb-distribute/src/persistedLogicalClock.ts";

export type User = { id: number; name: string };
export type Post = { id: string; content: string };

export interface SimClient {
  crdtDb: CRDTDatabase;           // High-level CRDT API for data operations
  repo: IDBRepository;            // Low-level repository for inspecting state
  sync: Sync;                     // Sync manager (reusable instance)
  clock: PersistedLogicalClock;   // Logical clock
}

export const newClient = async (prng: seedrandom.PRNG): Promise<SimClient> => {
  const dbName = "db_" + randomUUID(prng);
  const generateId = () => randomUUID(prng);

  // Create shared repository
  const repo = new IDBRepository();
  await repo.open(dbName);

  // Create sync and clock using shared repo
  const sync = new Sync(repo);
  const clock = new PersistedLogicalClock(repo);

  // Create CRDTDatabase (pass dummy URL since we sync manually via Go)
  const crdtDb = new CRDTDatabase(
    dbName,
    "http://manual-sync",  // Won't be used - simulator handles sync
    sync,
    repo,  // Share the same repository
    generateId,
  );

  // Open CRDTDatabase (initializes client state)
  await crdtDb.open();

  return { crdtDb, repo, sync, clock };
};

//  ------------------------------------------------------------------------
//  Random
//  ------------------------------------------------------------------------
export function randomInt(rng: seedrandom.PRNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randomChance(rng: seedrandom.PRNG, probability: number): boolean {
  return rng() < probability;
}

export function shuffleArray<T>(rng: seedrandom.PRNG, array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generates a deterministic "random" UUID v4 style using the given PRNG.
 * The format is 8-4-4-4-12 hex characters.
 */
export function randomUUID(rng: seedrandom.PRNG): string {
  const hex = [...Array(16)].map(() => Math.floor(rng() * 256).toString(16).padStart(2, "0"));

  // Per RFC 4122: set version (4) and variant (10x)
  hex[6] = (parseInt(hex[6], 16) & 0x0f | 0x40).toString(16).padStart(2, "0");
  hex[8] = (parseInt(hex[8], 16) & 0x3f | 0x80).toString(16).padStart(2, "0");

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
