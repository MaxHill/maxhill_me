import { applyOperationToRow, CRDTOperation, Dot } from "../crdt.ts";
import {
  CLIENT_STATE_STORE,
  IDBRepository,
  OPERATIONS_STORE,
  ROWS_STORE,
} from "../IDBRepository.ts";
import { PersistedLogicalClock } from "../persistedLogicalClock.ts";
import { validateTransactionStores } from "../utils.ts";
import { SyncErrorCode, isSyncError } from "./errors.ts";

export interface SyncRequest {
  clientId: string;

  /**
   * Local changes that need to be persisted on the server. These operations
   * will be assigned server versions and become part of the global operation log.
   */
  operations: CRDTOperation[];

  /**
   * Establishes the baseline for determining which remote operations to return.
   * Operations with higher server versions represent changes this client hasn't
   * seen yet.
   */
  lastSeenServerVersion: number;

  /**
   * Detects corruption during transmission. Network issues or middleware could
   * silently modify the request, leading to data inconsistency.
   */
  requestHash: string;
}

export interface SyncResponse {
  /**
   * Detects race conditions where multiple syncs are in flight but returned out
   * of order. This ensures responses are applied in the correct sequence.
   */
  baseServerVersion: number;

  /**
   * Represents the new synchronization checkpoint. This value becomes the baseline
   * for the next sync, ensuring continuity in the operation stream.
   */
  latestServerVersion: number;

  /**
   * Detects corruption during transmission. Applying corrupted operations would
   * permanently diverge the client's state from other replicas.
   */
  responseHash: string;

  /**
   * Contains changes from other clients that need to be merged locally. These
   * operations bring this client's view of the data up to date with the global state.
   */
  operations: CRDTOperation[];

  /**
   * Confirms which local operations were successfully persisted. This prevents
   * re-sending operations that have already been committed to the server.
   */
  syncedOperations: Dot[];
}

export class Sync {
  private idbRepository: IDBRepository;

  constructor(idbRepository: IDBRepository) {
    this.idbRepository = idbRepository;
  }

  /**
   * Creates a sync request containing local changes to send to the server.
   *
   * Transaction requirements:
   * - Stores: [CLIENT_STATE_STORE, OPERATIONS_STORE]
   * - Mode: "readonly" (queries client state and unsynced operations)
   *
   * Example:
   * ```typescript
   * const tx = repo.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE], "readonly");
   * const request = await sync.createSyncRequest(tx);
   * // Transaction auto-completes when all requests finish - no need to wait explicitly
   * ```
   * @param tx - Transaction with required stores (see above)
   * @returns Sync request ready to send to server
   * @throws {Error} If transaction is missing required stores
   */
  async createSyncRequest(tx: IDBTransaction): Promise<SyncRequest> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE, OPERATIONS_STORE]);

    const { clientId, lastSeenServerVersion } = await this.idbRepository
      .getClientState(tx);

    // Extract operations using optimized compound index query
    const operations = await this.idbRepository.getUnsyncedOperationsByClient(tx, clientId);

    // create integrity hash
    const requestHash = await this.createRequestHash({
      clientId,
      lastSeenServerVersion,
      operations,
    });

    return {
      clientId,
      lastSeenServerVersion,
      operations,
      requestHash,
    };
  }

  async sendSyncRequest(endpointUrl: string, request: SyncRequest): Promise<SyncResponse> {
    // TODO: encode operation fields
    // json serialize
    const body = JSON.stringify(request);

    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      if (!response.ok) {
        // Try to parse structured error from response
        try {
          const errorData = await response.json();
          
          // Check if this is a structured SyncError
          if (isSyncError(errorData)) {
            // For CLIENT_STATE_OUT_OF_SYNC, throw a special error that the client can catch
            if (errorData.code === SyncErrorCode.CLIENT_STATE_OUT_OF_SYNC) {
              const error = new Error(errorData.message);
              error.name = SyncErrorCode.CLIENT_STATE_OUT_OF_SYNC;
              throw error;
            }
            
            // For other sync errors, include the code in the error message
            throw new Error(`Sync error [${errorData.code}]: ${errorData.message}`);
          }
          
          // Fallback for non-structured errors
          const message = errorData.error || errorData.message || "Unknown error";
          throw new Error(`Sync failed (${response.status}): ${message}`);
        } catch (parseError) {
          // If we can't parse the response, use status text
          throw new Error(`Sync failed (${response.status}): ${response.statusText || "Unknown error"}`);
        }
      }
      
      let syncResponse: SyncResponse = await response.json();

      return syncResponse;
    } catch (error: any) {
      if (!error || !error.message) {
        throw new Error(`Unknown error occurred during sync: ${error}`);
      }
      
      // Re-throw CLIENT_STATE_OUT_OF_SYNC errors as-is so they can be handled by the caller
      if (error.name === SyncErrorCode.CLIENT_STATE_OUT_OF_SYNC) {
        throw error;
      }
      
      if (error instanceof TypeError || error.message.includes("fetch")) {
        // Network error - potentially retryable
        throw new Error(`Sync network failure: ${error.message}`, { cause: error });
      } else {
        // Other error - likely non-retryable
        throw error;
      }
    }
  }

  async handleSyncResponse(
    tx: IDBTransaction,
    logicalClock: PersistedLogicalClock,
    response: SyncResponse,
  ): Promise<void> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE], "readwrite");

    // Start IDB requests FIRST to keep transaction alive
    // Get client state synchronously
    const clientStatePromise = this.idbRepository.getClientState(tx);
    
    // Now we can safely await non-IDB operations (hash validation)
    await this.validateResponseHash(response);
    
    // Now await the client state
    const { clientId, lastSeenServerVersion } = await clientStatePromise;
    
    // Check if response is stale/out-of-order - if so, drop it
    if (lastSeenServerVersion !== response.baseServerVersion) {
      console.warn(
        `Dropping stale sync response: expected base ${lastSeenServerVersion}, got ${response.baseServerVersion}. ` +
        `This can happen with delayed syncs arriving after newer syncs have completed.`
      );
      return;
    }

    try {
      // Save operations and apply operations to materialized view
      await this.applyRemoteOperations(tx, response.operations);

      // update lastSeenServerVersion to latestServerVersion from response
      await this.idbRepository.saveServerVersion(tx, response.latestServerVersion);

      // update synced field on the synced local entries
      const operationsPromises: Promise<void>[] = [];
      for (const operationId of response.syncedOperations) {
        operationsPromises.push(this.idbRepository.saveOperationAsSynced(tx, operationId));
      }
      await Promise.all(operationsPromises);

      // We only sync the clocks if we get any new operations from the server
      // otherwise it would be unnesesary work where we'd sync the clock with -1
      // and keep the current value
      if (response.operations.length) {
        const highestVersion = response.operations.reduce((prev, curr) => {
          return Math.max(prev, curr.dot.version);
        }, -1);
        await logicalClock.sync(tx, highestVersion);
      }

      return;
    } catch (err: any) {
      // Explicitly abort the transaction to ensure all writes are rolled back
      // JavaScript errors don't automatically abort transactions, so we must do it explicitly
      try {
        tx.abort();
      } catch (abortErr) {
        // Ignore abort errors - transaction may already be aborted
      }
      
      // Don't re-throw - transaction has been aborted, let it complete
      // The caller should handle sync failures gracefully and retry
      console.error("Sync failed, transaction aborted:", err);
      return;
    }
  }

  /**
   * Apply remote operations (from sync)
   */
  private async applyRemoteOperations(
    tx: IDBTransaction,
    operations: CRDTOperation[],
  ): Promise<void> {
    // Validate operations before processing to fail fast on corrupted data
    for (const op of operations) {
      if (op.type === "set") {
        if (typeof op.field !== "string" || op.field === "") {
          throw new Error(`Invalid set operation: field must be a non-empty string, got ${typeof op.field}`);
        }
        if (op.value === undefined || op.value === null) {
          throw new Error(`Invalid set operation: value must be defined, got ${op.value}`);
        }
      } else if (op.type === "setRow") {
        if (typeof op.value !== "object" || op.value === null || Array.isArray(op.value)) {
          throw new Error(`Invalid setRow operation: value must be a plain object, got ${typeof op.value}`);
        }
      } else if (op.type === "remove") {
        if (typeof op.context !== "object" || op.context === null || Array.isArray(op.context)) {
          throw new Error(`Invalid remove operation: context must be a plain object, got ${typeof op.context}`);
        }
      }
    }

    // Group operations by row for batch processing
    const operationsByRow = new Map<string, CRDTOperation[]>();

    for (const operation of operations) {
      const key = `${operation.table}:${String(operation.rowKey)}`;
      if (!operationsByRow.has(key)) {
        operationsByRow.set(key, []);
      }
      operationsByRow.get(key)!.push(operation);
    }

    const saveOperationsPromise = this.idbRepository.batchSaveOperations(tx, operations);
    const savePromises = this.batchUpdateRows(tx, operationsByRow);

    await saveOperationsPromise;
    await savePromises;
  }

  /**
   * Batch apply operations to rows
   * @param {IDBTransaction} tx - IDBTransaction
   * @param {Map} operationsByRow - Map of the rowId, operations to apply
   * @returns {Promise<void>[]} - A list of promises that can be awaited with promise.all
   */
  private async batchUpdateRows(
    tx: IDBTransaction,
    operationsByRow: Map<string, CRDTOperation[]>,
  ): Promise<void> {
    const rowFetchPromises = Array.from(operationsByRow.entries()).map(
      async ([key, rowOperations]) => {
        const firstOperation = rowOperations[0];
        const row = await this.idbRepository.getRow(
          tx,
          firstOperation.table,
          firstOperation.rowKey,
        );
        return { key, row, rowOperations: rowOperations, firstOp: firstOperation };
      },
    );

    const rowsData = await Promise.all(rowFetchPromises);

    for (const { row, rowOperations } of rowsData) {
      for (const operation of rowOperations) {
        applyOperationToRow(row, operation);
      }
    }

    const savePromises = rowsData.map(({ firstOp, row }) =>
      this.idbRepository.saveRow(tx, firstOp.table, firstOp.rowKey, row)
    );

    await Promise.all(savePromises);

    return;
  }

  //  ------------------------------------------------------------------------
  //  Integrity hashing
  //  ------------------------------------------------------------------------
  //  As a way to handle broken requests and responses each sync request
  //  has a hash that is validated both on the server and client, this
  //  is not done for security reasons (even if it might help). Rather it's
  //  done to ensure correctness.
  private async createRequestHash(req: Omit<SyncRequest, "requestHash">): Promise<string> {
    const parts: string[] = [
      req.clientId,
      String(req.lastSeenServerVersion),
    ];

    for (const op of req.operations) {
      let value = "null";
      let valueKey = "null";

      if (op.type === "set") {
        value = JSON.stringify(op.value);
        valueKey = op.field ?? "null";
      }

      if (op.type === "setRow") {
        value = JSON.stringify(op.value);
      }

      // op.type === "remove"
      // value & valueKey stay "null" (matches Go)

      parts.push(
        String(op.rowKey),
        op.table,
        op.type,
        value,
        valueKey,
        String(op.dot.version),
        op.dot.clientId,
      );
    }

    const result = await this.sha256Array(parts);
    return result;
  }

  private async createResponseHash(
    response: Omit<SyncResponse, "responseHash">,
  ) {
    const parts: string[] = [
      String(response.baseServerVersion),
      String(response.latestServerVersion),
    ];

    // Add operation fields - must match server hash logic exactly
    for (const operation of response.operations) {
      parts.push(operation.type);
      parts.push(operation.table);
      parts.push(String(operation.rowKey));
      parts.push(operation.dot.clientId);
      parts.push(String(operation.dot.version));

      // Include operation-specific fields
      if (operation.type === "set") {
        parts.push(operation.field ?? "null");
        parts.push(JSON.stringify(operation.value));
      } else if (operation.type === "setRow") {
        parts.push("null"); // field placeholder for consistency
        parts.push(JSON.stringify(operation.value));
      } else if (operation.type === "remove") {
        parts.push("null"); // field placeholder
        parts.push("null"); // value placeholder
        // Add context for remove operations
        const contextKeys = Object.keys(operation.context).sort();
        for (const key of contextKeys) {
          parts.push(key);
          parts.push(String(operation.context[key]));
        }
      }
    }

    // Add synced operations
    for (const dot of response.syncedOperations) {
      parts.push(dot.clientId);
      parts.push(String(dot.version));
    }

    return this.sha256Array(parts);
  }

  private async validateResponseHash(response: SyncResponse): Promise<SyncResponse> {
    const localHash = await this.createResponseHash(response);
    if (localHash !== response.responseHash) {
      const debugInfo = {
        expected: response.responseHash,
        actual: localHash,
        baseServerVersion: response.baseServerVersion,
        latestServerVersion: response.latestServerVersion,
        operationCount: response.operations.length,
        syncedOperationCount: response.syncedOperations.length,
      };
      console.error("Sync response failed integrity check", debugInfo);
      return Promise.reject(
        new Error(`Sync response failed integrity check: ${JSON.stringify(debugInfo)}`),
      );
    }
    return response;
  }

  /**
   * Compute SHA-256 hash from an array of strings.
   * Used for integrity verification of sync requests and responses.
   */
  private async sha256Array(parts: string[]): Promise<string> {
    const combined = parts.join("|");
    const buffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(combined),
    );
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
