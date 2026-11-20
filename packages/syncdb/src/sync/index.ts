import { applyOperationToRow, CRDTOperation } from "../crdt.ts";
import {
  CLIENT_STATE_STORE,
  OPERATIONS_STORE,
  ROWS_STORE,
} from "../indexeddb/lifecycle.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { PersistedLogicalClock } from "../persistedLogicalClock.ts";
import { abortFailedTransaction, validateTransactionStores } from "../utils.ts";
import { isSyncError } from "./errors.ts";
import { assertValidDbName } from "../dbName.ts";
import { encodeCanonicalJson } from "./canonical-json.ts";

const WIRE_PROTOCOL_VERSION = 3;

type Mutation = {
  id: number;
  operation: CRDTOperation;
};

export interface SyncRequest {
  protocolVersion: 3;
  clientId: string;
  dbName: string;
  clientLastMutationID: number;
  mutations: Mutation[];
  lastSeenServerVersion: number;
  requestHash: string;
}

export interface SyncResponse {
  protocolVersion: 3;
  clientId: string;
  baseServerVersion: number;
  latestServerVersion: number;
  lastMutationID: number;
  responseHash: string;
  operations: CRDTOperation[];
}

export type SyncHeadersProvider = () => Promise<Record<string, string>>;
export type OnUnauthorizedHandler = () => Promise<boolean>;

async function readServerError(response: Response): Promise<Error> {
  let data: unknown;
  const fallback = `Sync failed (${response.status}): ${response.statusText || "Unknown error"}`;
  try {
    data = await response.json();
  } catch (cause) {
    return new Error(fallback, { cause });
  }
  if (isSyncError(data)) {
    const error = new Error(data.message);
    error.name = data.code;
    return error;
  }
  if (data !== null && typeof data === "object") {
    const fields = data as Record<string, unknown>;
    const message = typeof fields.error === "string" ? fields.error : fields.message;
    if (typeof message === "string" && message) {
      return new Error(`Sync failed (${response.status}): ${message}`);
    }
  }
  return new Error(fallback);
}

function requireResponseMetadata(value: unknown): asserts value is SyncResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid sync response");
  }
  const response = value as Record<string, unknown>;
  if (response.protocolVersion !== WIRE_PROTOCOL_VERSION ||
      typeof response.clientId !== "string" || !response.clientId ||
      !Number.isSafeInteger(response.baseServerVersion) ||
      !Number.isSafeInteger(response.latestServerVersion) ||
      !Number.isSafeInteger(response.lastMutationID) || (response.lastMutationID as number) < 0 ||
      !Array.isArray(response.operations) || typeof response.responseHash !== "string") {
    throw new Error("Invalid sync response metadata");
  }
}

export class Sync {
  private clientState: ClientState;
  private rowStore: RowStore;
  private operationLog: OperationLog;
  private headersProvider?: SyncHeadersProvider;
  private onUnauthorized?: OnUnauthorizedHandler;

  constructor(
    ...parameters: [
      clientState: ClientState,
      rowStore: RowStore,
      operationLog: OperationLog,
      headersProvider?: SyncHeadersProvider,
      onUnauthorized?: OnUnauthorizedHandler,
    ]
  ) {
    const [clientState, rowStore, operationLog, headersProvider, onUnauthorized] = parameters;
    this.clientState = clientState;
    this.rowStore = rowStore;
    this.operationLog = operationLog;
    if (headersProvider) {
      this.headersProvider = headersProvider;
    }
    if (onUnauthorized) {
      this.onUnauthorized = onUnauthorized;
    }
  }

  async createSyncRequest(tx: IDBTransaction, dbName: string): Promise<SyncRequest> {
    assertValidDbName(dbName);
    validateTransactionStores(tx, [CLIENT_STATE_STORE, OPERATIONS_STORE]);

    const { clientId, lastSeenServerVersion, lastMutationID, lastGeneratedMutationID } =
      await this.clientState.getClientState(tx);

    const pendingMutations = await this.operationLog.getPendingMutationsByClient(tx, clientId);
    const expectedCount = lastGeneratedMutationID - lastMutationID;
    if (pendingMutations.length !== expectedCount) {
      throw new Error(
        "Pending mutation count mismatch. " +
          `expected=${expectedCount}, actual=${pendingMutations.length}`,
      );
    }

    for (let i = 0; i < pendingMutations.length; i++) {
      const expectedID = lastMutationID + i + 1;
      if (pendingMutations[i].mutationID !== expectedID) {
        throw new Error(
          "Pending mutations must be contiguous. " +
            `expected=${expectedID}, actual=${pendingMutations[i].mutationID}`,
        );
      }
    }

    const mutations = pendingMutations.map((entry) => ({
      id: entry.mutationID,
      operation: entry.operation,
    }));

    const requestHash = await this.createRequestHash({
      protocolVersion: WIRE_PROTOCOL_VERSION,
      clientId,
      dbName,
      clientLastMutationID: lastMutationID,
      lastSeenServerVersion,
      mutations,
    });

    return {
      protocolVersion: WIRE_PROTOCOL_VERSION,
      clientId,
      dbName,
      clientLastMutationID: lastMutationID,
      lastSeenServerVersion,
      mutations,
      requestHash,
    };
  }

  async sendSyncRequest(endpointUrl: string, request: SyncRequest): Promise<SyncResponse> {
    const doFetch = async (): Promise<Response> => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.headersProvider) {
        Object.assign(headers, await this.headersProvider());
      }
      return fetch(endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
      });
    };
    try {
      let response = await doFetch();
      if (
        response.status === 401 &&
        this.onUnauthorized &&
        await this.onUnauthorized()
      ) {
        response = await doFetch();
      }
      if (!response.ok) {
        throw await readServerError(response);
      }
      const parsed: unknown = await response.json();
      requireResponseMetadata(parsed);
      this.validateReplyForRequest(parsed, request);
      return parsed;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Sync network failure: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  private validateReplyForRequest(response: SyncResponse, request: SyncRequest): void {
    if (response.clientId !== request.clientId) {
      throw new Error(`Invalid sync response clientId ${response.clientId}`);
    }
    if (response.baseServerVersion !== request.lastSeenServerVersion) {
      throw new Error("Invalid sync response baseServerVersion");
    }
    if (response.lastMutationID < request.clientLastMutationID) {
      throw new Error("Server mutation frontier regressed");
    }
  }

  async handleSyncResponse(
    tx: IDBTransaction,
    logicalClock: PersistedLogicalClock,
    response: SyncResponse,
  ): Promise<Set<string>> {
    validateTransactionStores(
      tx,
      [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE],
      "readwrite",
    );

    const { clientId, lastSeenServerVersion, lastMutationID, lastGeneratedMutationID } =
      await this.clientState.getClientState(tx);

    if (response.protocolVersion !== WIRE_PROTOCOL_VERSION) {
      throw new Error(`Unsupported sync protocol version ${response.protocolVersion}`);
    }
    if (response.clientId !== clientId) {
      throw new Error(
        `Dropping sync response: expected clientId ${clientId}, got ${response.clientId}`,
      );
    }
    if (!Number.isSafeInteger(response.lastMutationID) || response.lastMutationID < 0) {
      throw new Error(`Invalid sync response lastMutationID: ${response.lastMutationID}`);
    }
    if (response.lastMutationID > lastGeneratedMutationID) {
      throw new Error(
        `Server acknowledged mutation ${response.lastMutationID} ` +
          `beyond local frontier ${lastGeneratedMutationID}`,
      );
    }

    const nextAck = Math.max(lastMutationID, response.lastMutationID);
    const staleBase = lastSeenServerVersion !== response.baseServerVersion;

    try {
      if (staleBase) {
        console.warn(
          `Skipping stale sync operations: expected base ${lastSeenServerVersion}, ` +
            `got ${response.baseServerVersion}.`,
        );
      } else {
        await this.applyFreshSyncResponse(tx, logicalClock, response);
      }

      await this.clientState.setLastMutationID(tx, nextAck);
      await this.operationLog.deletePendingMutationsThrough(tx, clientId, nextAck);
    } catch (error) {
      abortFailedTransaction(tx);
      throw error;
    }

    return staleBase
      ? new Set()
      : new Set(response.operations.map((operation) => operation.tableName));
  }

  private async applyFreshSyncResponse(
    tx: IDBTransaction,
    logicalClock: PersistedLogicalClock,
    response: SyncResponse,
  ): Promise<void> {
    await this.applyRemoteOperations(tx, response.operations);

    const checkpoints = response.operations.filter(
      (
        operation,
      ): operation is Extract<CRDTOperation, { type: "checkpointRow" }> =>
        operation.type === "checkpointRow",
    );
    await this.operationLog.deleteCoveredAcceptedOperations(tx, checkpoints);

    await this.clientState.saveServerVersion(tx, response.latestServerVersion);

    if (response.operations.length) {
      const highestVersion = response.operations.reduce(
        (previous, current) => Math.max(previous, current.dot.version),
        -1,
      );
      await logicalClock.sync(tx, highestVersion);
    }
  }

  private async applyRemoteOperations(
    tx: IDBTransaction,
    operations: CRDTOperation[],
  ): Promise<void> {
    for (const operation of operations) {
      if (operation.type === "setRow") {
        if (
          typeof operation.fields !== "object" ||
          operation.fields === null ||
          Array.isArray(operation.fields)
        ) {
          throw new Error(
            "Invalid setRow operation: fields must be a plain object, " +
              `got ${typeof operation.fields}`,
          );
        }
        if (Object.prototype.hasOwnProperty.call(operation.fields, "_key")) {
          throw new Error(`Operation: ${operation.dot} contained illegal _key property.`);
        }
      } else if (operation.type === "checkpointRow") {
        if (
          !Number.isSafeInteger(operation.checkpointSeenServerVersion) ||
          operation.checkpointSeenServerVersion < 0 ||
          typeof operation.fields !== "object" ||
          operation.fields === null ||
          Array.isArray(operation.fields)
        ) {
          throw new Error("Invalid checkpointRow state");
        }
      } else if (operation.type === "removeRow") {
        if (
          typeof operation.versionVector !== "object" ||
          operation.versionVector === null ||
          Array.isArray(operation.versionVector)
        ) {
          throw new Error(
            "Invalid removeRow operation: versionVector must be a plain object",
          );
        }
      } else {
        throw new Error(
          `Unsupported operation type: ${(operation as { type?: unknown }).type}`,
        );
      }
    }

    const operationsByRow = new Map<string, CRDTOperation[]>();
    for (const operation of operations) {
      const key = `${operation.tableName}:${String(operation.rowKey)}`;
      if (!operationsByRow.has(key)) {operationsByRow.set(key, []);}
      operationsByRow.get(key)!.push(operation);
    }

    await this.operationLog.batchSaveOperations(tx, operations);
    await this.batchUpdateRows(tx, Array.from(operationsByRow.values()));
  }

  private async batchUpdateRows(
    tx: IDBTransaction,
    operationGroups: CRDTOperation[][],
  ): Promise<void> {
    const rowsData = await Promise.all(
      operationGroups.map(async (rowOperations) => {
        const firstOp = rowOperations[0];
        const row = await this.rowStore.getRow(tx, firstOp.tableName, firstOp.rowKey);
        return { row, rowOperations };
      }),
    );

    for (const { row, rowOperations } of rowsData) {
      for (const operation of rowOperations) {applyOperationToRow(row, operation);}
    }

    await Promise.all(
      rowsData.map(({ row }) => this.rowStore.saveRow(tx, row)),
    );
  }

  private async createRequestHash(request: Omit<SyncRequest, "requestHash">): Promise<string> {
    const parts: string[] = [
      String(request.protocolVersion),
      request.clientId,
      request.dbName,
      String(request.clientLastMutationID),
      String(request.lastSeenServerVersion),
    ];

    for (const mutation of request.mutations) {
      const operation = mutation.operation;
      let value = "null";
      if (operation.type === "setRow") {
        value = encodeCanonicalJson(operation.fields);
      } else if (operation.type === "removeRow") {
        value = encodeCanonicalJson(operation.versionVector);
      }

      parts.push(
        String(mutation.id),
        String(operation.rowKey),
        operation.tableName,
        operation.type,
        value,
        "null",
        String(operation.dot.version),
        operation.dot.clientId,
      );
    }

    return this.sha256Array(parts);
  }

  private async createResponseHash(response: Omit<SyncResponse, "responseHash">) {
    const parts: string[] = [
      String(response.protocolVersion),
      response.clientId,
      String(response.baseServerVersion),
      String(response.latestServerVersion),
      String(response.lastMutationID),
    ];

    for (const operation of response.operations) {
      parts.push(operation.type);
      parts.push(operation.tableName);
      parts.push(String(operation.rowKey));
      parts.push(operation.dot.clientId);
      parts.push(String(operation.dot.version));

      if (operation.type === "setRow") {
        parts.push("null");
        parts.push(encodeCanonicalJson(operation.fields));
      } else if (operation.type === "checkpointRow") {
        parts.push("null");
        const checkpointPayload = {
          fields: operation.fields,
          ...(operation.tombstone ? { tombstone: operation.tombstone } : {}),
        };
        parts.push(encodeCanonicalJson(checkpointPayload));
        parts.push(String(operation.checkpointSeenServerVersion));
      } else if (operation.type === "removeRow") {
        parts.push("null");
        parts.push("null");
        const contextKeys = Object.keys(operation.versionVector).sort(
          (left, right) => this.compareUtf8(left, right),
        );
        for (const key of contextKeys) {
          parts.push(key);
          parts.push(String(operation.versionVector[key]));
        }
      }
      parts.push(String(operation.serverVersion));
    }

    return this.sha256Array(parts);
  }

  async validateResponseHash(response: SyncResponse): Promise<boolean> {
    const localHash = await this.createResponseHash(response);
    if (localHash !== response.responseHash) {
      const debugInfo = {
        expected: response.responseHash,
        actual: localHash,
        baseServerVersion: response.baseServerVersion,
        latestServerVersion: response.latestServerVersion,
        operationCount: response.operations.length,
      };
      console.warn("Dropping sync response with invalid integrity hash", debugInfo);
      return false;
    }
    return true;
  }

  private compareUtf8(a: string, b: string): number {
    const encoder = new TextEncoder();
    const aBytes = encoder.encode(a);
    const bBytes = encoder.encode(b);
    const length = Math.min(aBytes.length, bBytes.length);
    for (let i = 0; i < length; i++) {
      if (aBytes[i] !== bBytes[i]) {return aBytes[i] - bBytes[i];}
    }
    return aBytes.length - bBytes.length;
  }

  private async sha256Array(parts: string[]): Promise<string> {
    const combined = parts.join("|");
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(combined));
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
