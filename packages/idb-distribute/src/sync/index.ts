import { applyOpToRow, CRDTOperation } from "../crdt";
import { IDBRepository } from "../IDBRepository";
import { PersistedLogicalClock } from "../persistedLogicalClock";

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
  syncedOperations: string[];
}

export class Sync {
  private idbRepository: IDBRepository;

  constructor(idbRepository: IDBRepository) {
    this.idbRepository = idbRepository;
  }

  async createSyncRequest(tx: IDBTransaction): Promise<SyncRequest> {
    const { clientId, lastSeenServerVersion } = await this.idbRepository
      .getClientState(tx);

    // Extract operations
    let operations = await this.idbRepository.getUnsyncedOperations(tx as any);
    operations = operations.filter((e) => e.dot.clientId === clientId);
    // create integrity hash
    const requestHash = await this.createRequestHash(clientId, lastSeenServerVersion, operations);

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
        throw new Error(`Sync request encountered an error: ${response.status}`);
      }
      let syncResponse: SyncResponse = await response.json();

      return syncResponse;
    } catch (error) {
      console.error("Sync request failed", error);
      // TODO: This is not good, we should handle the error
      throw error;
    }
  }

  async handleSyncResponse(
    tx: IDBTransaction,
    logicalClock: PersistedLogicalClock,
    response: SyncResponse,
  ): Promise<void> {
    // Validate response hash
    const localHash = await this.createResponseHash(response);
    if (localHash !== response.responseHash) {
      console.error("Sync response failed integrity check", localHash, response.responseHash);

      return Promise.reject("Sync response failed integrity check");
    }
    // Save operations and apply operations to materialized view
    this.applyRemoteOps(tx, response.operations);

    // update lastSeenServerVersion to latestServerVersion from response
    this.idbRepository.saveServerVersion(tx, response.latestServerVersion);

    // update synced field on the synced local entries
    for (const id of response.syncedOperations) {
      // TODO: mark operation as synced.
    }

    // Sync clocks
    const highestVersion = response.operations.reduce((prev, curr) => {
      return Math.max(prev, curr.dot.version);
    }, -1);
    await logicalClock.sync(tx, highestVersion);
    return Promise.resolve();
  }

  /**
   * Apply remote operations (from sync)
   */
  private async applyRemoteOps(tx: IDBTransaction, ops: CRDTOperation[]): Promise<void> {
    // Group operations by row for efficiency
    const opsByRow = new Map<string, CRDTOperation[]>();

    for (const op of ops) {
      const key = `${op.table}:${String(op.rowKey)}`;
      if (!opsByRow.has(key)) {
        opsByRow.set(key, []);
      }
      // TODO: We should add a Merge function to CRDT.ts and merge the ops here.
      // The benefit would be that we could remove the nested loop
      // when doing applyOpToRow
      // Then we could do:
      //    opsByRow.set(key, crdt.merge(opsByRow.get(key), op));
      opsByRow.get(key)!.push(op);

      // TODO: This is a performance problem, we should do
      // 1 promise.all for all operations and row saving
      await this.idbRepository.logOperation(tx, op);
    }

    for (const [_key, rowOps] of opsByRow) {
      const firstOp = rowOps[0];
      const row = await this.idbRepository.getRow(tx, firstOp.table, firstOp.rowKey);

      for (const op of rowOps) {
        applyOpToRow(row, op);
      }

      await this.idbRepository.saveRow(tx, firstOp.table, firstOp.rowKey, row);
    }
  }

  //  ------------------------------------------------------------------------
  //  Integrity hashing
  //  ------------------------------------------------------------------------
  //  As a way to handle broken requests and responses each sync request
  //  has a hash that is validated both on the server and client, this
  //  is not done for security reasons (even if it might help). Rather it's
  //  done to ensure correctness.

  private async createRequestHash(
    clientId: string,
    clientLastSeenVersion: number,
    operations: CRDTOperation[],
  ) {
    return this.sha256Array([
      clientId,
      String(clientLastSeenVersion),
      ...operations.flatMap((op: CRDTOperation) => [
        op.type,
        op.table,
        String(op.rowKey),
        op.dot.clientId,
        String(op.dot.version),
      ]),
    ]);
  }

  private async createResponseHash(
    response: SyncResponse,
  ) {
    return this.sha256Array([
      String(response.baseServerVersion),
      String(response.latestServerVersion),
      ...response.operations.flatMap((op: CRDTOperation) => [
        op.type,
        op.table,
        String(op.rowKey),
        op.dot.clientId,
        String(op.dot.version),
      ]),
      ...response.syncedOperations.flatMap((id) => id),
    ]);
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
