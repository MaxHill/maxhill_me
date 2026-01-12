// Serialization encoding/decoding
// ?

import { CRDTOperation } from "../crdt";
import { IDBRepository } from "../IDBRepository";

// Hashing / Integrity
// HashSyncRequest
// HashSyncResponse
// ValidateSyncResponse

// CreateSyncRequest
//      idbRepository.getOperationsFrom(version) // Events to sync

// SendSyncRequest
//      Make http request, not part of simulator

// ReceiveSyncRequest
//      Write the operations,

export interface SyncRequest {
  clientId: string;
  operations: CRDTOperation[];
  lastSeenServerVersion: number;
  requestHash: string; // sha-256 hash of the request, the request should be rehashed and compared to this to ensure integrity on the server
}

export interface SyncResponse {
  fromServerVersion: number; // Used to determine if the response is ok to apply. Can be removed when crdt is implemented
  responseHash: string; // sha-256 hash of the response, the response should be rehashed and compared to this to ensure integrity
  operations: CRDTOperation[];
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

    // encode operation fields
    // json serialize
    return {
      clientId,
      lastSeenServerVersion,
      operations,
      requestHash,
    };
  }

  async sendSyncRequest(): Promise<SyncResponse> {
    // Make http request
    return Promise.resolve({
      fromServerVersion: 0,
      responseHash: "",
      operations: [],
    });
  }
  /*Rename*/ receiveSyncRequest(): Promise<void> {
    // Save operations
    // update lastSeenServerVersion
    // Sync clocks
    return Promise.resolve();
  }

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
