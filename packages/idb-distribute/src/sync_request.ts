import type { IDBPDatabase } from "idb";
import type { SyncRequest, SyncResponse, WALOperation } from "./types.ts";
import type { WAL } from "./wal.ts";
import { dbCommands, dbQueries, INTERNAL_DB_STORES, type InternalDbSchema } from "./db.ts";
import * as logicalClock from "./persistedLogicalClock.ts";
import { encodeWALOperation, decodeWALOperation } from "./serialization.ts";

//  ------------------------------------------------------------------------
//  Integrity / Hashing
//  ------------------------------------------------------------------------

/**
 * Compute SHA-256 hash from an array of strings.
 * Used for integrity verification of sync requests and responses.
 */
async function sha256Array(parts: string[]): Promise<string> {
  const combined = parts.join("|");
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(combined),
  );
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash a sync request for integrity verification.
 */
export async function hashSyncRequest(
  clientId: string,
  clientLastSeenVersion: number,
  operations: WALOperation[],
): Promise<string> {
  const requestHashParts = [
    clientId,
    clientLastSeenVersion.toString(),
    ...operations.flatMap((e) => [
      String(e.key),
      e.table,
      e.operation,
      JSON.stringify(e.value ?? null),
      JSON.stringify(e.valueKey ?? null),
      e.version.toString(),
      e.clientId,
    ]),
  ];
  return await sha256Array(requestHashParts);
}

/**
 * Hash a sync response for integrity verification.
 */
export async function hashSyncResponse(
  operations: WALOperation[],
  fromServerVersion: number,
): Promise<string> {
  const responseHashParts = [
    fromServerVersion.toString(),
    ...operations.flatMap((e) => [
      String(e.key),
      e.table,
      e.operation,
      JSON.stringify(e.value ?? null),
      JSON.stringify(e.valueKey ?? null),
      e.version.toString(),
      e.clientId,
      (e.serverVersion ?? 0).toString(),
    ]),
  ];
  return await sha256Array(responseHashParts);
}

/**
 * Validate the integrity of a sync response.
 * Returns true if the hash matches, false otherwise.
 */
export async function validateSyncResponse(response: SyncResponse): Promise<boolean> {
  const computedHash = await hashSyncResponse(response.operations, response.fromServerVersion);
  return computedHash === response.responseHash;
}

//  ------------------------------------------------------------------------
//  Sync Request Creation
//  ------------------------------------------------------------------------

/**
 * Create a sync request from the current database state.
 * Extracts operations that need to be sent to the server.
 */
export async function createSyncRequest(db: IDBPDatabase<InternalDbSchema>, wal: WAL): Promise<SyncRequest> {
  const tx = db.transaction(["_clientId", "_lastSyncedVersion", "_wal"]);

  const clientId = await dbQueries.getClientIdTx(tx);
  const lastSyncedVersion = await dbQueries.getLastSyncedVersionTx(tx);

  const operations = await wal.getOperations(lastSyncedVersion + 1, tx as any);
  const toSync = operations.filter((e) => e.clientId === clientId);

  const lastSeenServerVersion = await dbQueries.getLastSeenServerVersion(tx as any);
  await tx.done;

  const requestHash = await hashSyncRequest(clientId, lastSeenServerVersion, toSync);

  return {
    clientId,
    clientLastSeenVersion: lastSeenServerVersion,
    operations: toSync,
    requestHash,
  };
}

//  ------------------------------------------------------------------------
//  Sync Response Handling
//  ------------------------------------------------------------------------

/**
 * Apply a sync response to the local database.
 * Validates integrity, merges WAL operations, and updates sync state.
 */
export async function applySyncResponse(
  db: IDBPDatabase<InternalDbSchema>,
  wal: WAL,
  request: SyncRequest,
  response: SyncResponse,
): Promise<void> {
  // Validate response integrity
  const isValid = await validateSyncResponse(response);
  if (!isValid) {
    console.error("Received invalid sync response", request, response);
    return;
  }

  const tx = db.transaction(Array.from(db.objectStoreNames), "readwrite");

  const lastSeenServerVersion = await dbQueries.getLastSeenServerVersion(tx);
  if (response.fromServerVersion !== lastSeenServerVersion) {
    console.error("Received out of order sync request", request, response);
    await tx.done;
    return;
  }

  if (response.operations.length) {
    await wal.batchWriteSyncedOperations(response.operations, tx);

    const lowestVersion = response.operations.reduce((prev, curr) => {
      return Math.min(prev, curr.version);
    }, Infinity);

    const lastAppliedVersion = await dbQueries.getLastAppliedVersionTx(tx);

    if (lowestVersion <= lastAppliedVersion) {
      await Promise.all(
        Array.from(db.objectStoreNames).map(
          async (storeName): Promise<void> => {
            if (INTERNAL_DB_STORES.includes(storeName)) return;
            const store = tx.objectStore(storeName);
            await store.clear();
          },
        ),
      );

      console.error("Database reset, starting re-application of WAL");
      await dbCommands.putLastAppliedVersion(tx, -1);
      await wal.applyPendingOperations(tx);
    } else {
      await wal.applyPendingOperations(tx);
    }

    // Sync clock with highest version from response
    const highestVersion = response.operations.reduce((prev, curr) => {
      return Math.max(prev, curr.version);
    }, -1);
    await logicalClock.sync(tx, highestVersion);
  }

  // TODO: Can we achieve this without looking at the request?
  if (request.operations.length > 0) {
    const maxVersion = Math.max(...request.operations.map((e) => e.version));
    await dbCommands.putLastSyncedVersion(tx, maxVersion);
  }
  await tx.done;
}

//  ------------------------------------------------------------------------
//  Network Request
//  ------------------------------------------------------------------------

/**
 * Send a sync request to the server and return the response.
 * Handles encoding/decoding of WAL operations for network transmission.
 */
export async function sendSyncRequest(req: SyncRequest): Promise<SyncResponse> {
  const body = { ...req, operations: req.operations.map(encodeWALOperation) };
  try {
    const response = await fetch("http://localhost:9900/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    let syncResponse: SyncResponse = await response.json();
    syncResponse = { ...syncResponse, operations: syncResponse.operations.map(decodeWALOperation) };
    return syncResponse;
  } catch (error) {
    console.error("Sync request failed:", error);
    throw error;
  }
}
