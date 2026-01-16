import { IDBRepository } from "./IDBRepository.ts";

/**
 * A persisted logical clock implementation.
 * Logical clocks help establish a partial ordering of events.
 * This implementation persists the clock's value in an IndexedDB database.
 *
 * @example
 * ```typescript
 * // Assumes 'idbRepository' is an initialized IDBRepository
 *
 * // Create a clock instance connected to the database
 * const clock = new PersistedLogicalClock(idbRepository);
 *
 * // Perform local events
 * const tx1 = idbRepository.transaction("clientState", "readwrite");
 * await clock.tick(tx1); // clock value is now 0
 *
 * const tx2 = idbRepository.transaction("clientState", "readwrite");
 * await clock.tick(tx2); // clock value is now 1
 *
 * // Synchronize with another clock's value
 * const otherVersion = 5;
 * const tx3 = idbRepository.transaction("clientState", "readwrite");
 * await clock.sync(tx3, otherVersion); // clock value is now 5 (max(1, 5))
 *
 * // Continue with a local event
 * const tx4 = idbRepository.transaction("clientState", "readwrite");
 * await clock.tick(tx4); // clock value is now 6
 * ```
 */
export class PersistedLogicalClock {
  constructor(private idbRepository: IDBRepository) {}

  /**
   * Increments the clock by 1, representing a local event.
   * @param tx - Transaction to use
   * @returns The new clock value after incrementing
   */
  async tick(tx: IDBTransaction): Promise<number> {
    if (!tx.objectStoreNames.contains("clientState")) {
      throw new Error("Transaction is missing clientState objectStore");
    }

    const currentVersion = await this.idbRepository.getVersion(tx);

    const newVersion = currentVersion + 1;
    await this.idbRepository.setVersion(tx, newVersion);

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
  async sync(tx: IDBTransaction, otherVersion: number): Promise<number> {
    if (!tx.objectStoreNames.contains("clientState")) {
      throw new Error("Transaction is missing clientState objectStore");
    }
    if (otherVersion < -1) {
      throw new Error(`Cannot sync with invalid version: ${otherVersion}`);
    }

    // Read current version
    const currentVersion = await this.idbRepository.getVersion(tx);
    const newVersion = Math.max(currentVersion, otherVersion);

    // Write new version atomically
    await this.idbRepository.setVersion(tx, newVersion);

    if (newVersion < -1) {
      throw new Error("Version could never be less than initialized value -1. Got: " + newVersion);
    }
    return newVersion;
  }
}
