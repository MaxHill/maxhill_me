import { promisifyIDBRequest } from "./utils.ts";

/**
 * A persisted logical clock implementation.
 * Logical clocks help establish a partial ordering of events.
 * This implementation persists the clock's value in an IndexedDB database.
 *
 * @example
 * ```typescript
 * // Assumes 'db' is an initialized IDBPDatabase<InternalDbSchema>
 *
 * // Create a clock instance connected to the database
 * const clock = new PersistedLogicalClock(db);
 *
 * // Initialize version for demonstration
 * await clock.putVersion(-1);
 *
 * // Perform local events
 * await clock.tick(); // clock value is now 0
 * await clock.tick(); // clock value is now 1
 *
 * // Synchronize with another clock's value
 * const otherVersion = 5;
 * await clock.sync(tx, otherVersion); // clock value is now 5 (max(1, 5))
 *
 * // Continue with a local event
 * await clock.tick(); // clock value is now 7
 * ```
 */

/**
 * Increments the clock by 1, representing a local event.
 * @param tx - Optional transaction to use. If not provided, creates a new transaction.
 * @returns The new clock value after incrementing
 */
export async function tick(
  tx: IDBTransaction,
): Promise<number> {
  if (!tx.objectStoreNames.contains("clientState")) {
    throw new Error("Transaction is missing clientState objectStore");
  }

  const currentVersion = await getVersion(tx);

  const newVersion = currentVersion + 1;
  await putVersion(tx, newVersion);

  if (newVersion < 0) {
    throw new Error("Version could never be less than 0 after ticking. Got: " + newVersion);
  }
  return newVersion;
}

/**
 * Synchronizes this clock with another clock's value when receiving remote state.
 * Sets this clock to the maximum of its current value and the other value.
 *
 * Note: Unlike traditional Lamport clocks which increment on receive (max+1),
 * we only increment during local writes via tick(). This prevents clock drift
 * during convergence when syncing repeatedly with the same remote state.
 * The "send" increment happens in tick() before writing the WAL entry.
 *
 * @param tx - Transaction to use
 * @param otherVersion - The other clock's version to synchronize with
 * @returns The new clock value after synchronization
 */
export async function sync(
  tx: IDBTransaction,
  otherVersion: number,
): Promise<number> {
  if (!tx.objectStoreNames.contains("clientState")) {
    throw new Error("Transaction is missing clientState objectStore");
  }

  // Read current version
  const currentVersion = await getVersion(tx);
  const newVersion = Math.max(currentVersion, otherVersion);

  // Write new version atomically
  await putVersion(tx, newVersion);

  if (newVersion < -1) {
    throw new Error("Version could never be less than initialized value -1. Got: " + newVersion);
  }
  return newVersion;
}

export async function getVersion(
  tx: IDBTransaction,
): Promise<number> {
  if (!tx.objectStoreNames.contains("clientState")) {
    throw new Error("Transaction is missing clientState objectStore");
  }

  const store = tx.objectStore("clientState");
  const version = await promisifyIDBRequest(store.get("logicalClock"));

  if (version === undefined) {
    throw new Error("Version should never be undefined since it's initialized to -1");
  }
  if (version < -1) {
    throw new Error("Version could never be less than initialized value -1. Got: " + version);
  }
  return version;
}

export async function putVersion(
  tx: IDBTransaction,
  version: number,
): Promise<number> {
  if (!tx.objectStoreNames.contains("clientState")) {
    throw new Error("Transaction is missing clientState objectStore");
  }
  const store = tx.objectStore("clientState");
  await promisifyIDBRequest(store.put(version, "logicalClock"));
  return version;
}
