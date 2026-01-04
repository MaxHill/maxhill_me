// @deno-types="npm:@types/seedrandom@^3.0.8"
import seedrandom from "seedrandom";
import { type DBSchema, type IDBPDatabase } from "idb";
import { InternalDbSchema, openAppDb, proxyIdb, Scheduler, WAL } from "@maxhill/idb-distribute";

export type User = { id: number; name: string };
export type Post = { id: string; content: string };
export interface ClientDbSchema extends DBSchema {
  users: {
    key: number;
    value: User;
  };
  posts: {
    key: string;
    value: Post;
  };
}

export interface SimClient {
  db: IDBPDatabase<ClientDbSchema & InternalDbSchema>;
  realDb: IDBPDatabase<ClientDbSchema & InternalDbSchema>; // Underlying non-proxied db
  wal: WAL;
  scheduler: Scheduler;
}

export const newClient = async (prng: seedrandom.PRNG): Promise<SimClient> => {
  const unique_name_sufix = randomUUID(prng);

  const db = await openAppDb<ClientDbSchema>("db_" + unique_name_sufix, 1, {
    upgrade(db: IDBPDatabase<ClientDbSchema>) {
      if (!db.objectStoreNames.contains("users")) {
        db.createObjectStore("users");
      }
      if (!db.objectStoreNames.contains("posts")) {
        db.createObjectStore("posts", { keyPath: "id" });
      }
    },
  }, () => randomUUID(prng)) as unknown as IDBPDatabase<InternalDbSchema>;

  // TODO: implement sendSyncRequest
  const wal = new WAL(() => randomUUID(prng));

  // No need to specify interval since we tick manually
  const scheduler = new Scheduler(/* 300 or whatever interval */);
  // NOTE: Sync is handled manually in client.ts, not via scheduler

  return {
    db: proxyIdb<ClientDbSchema & InternalDbSchema>(
      db as unknown as IDBPDatabase<InternalDbSchema & ClientDbSchema>,
      wal,
    ),
    realDb: db as unknown as IDBPDatabase<InternalDbSchema & ClientDbSchema>,
    wal,
    scheduler,
  };
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
