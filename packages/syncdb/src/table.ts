import {
  applyOperationToRow,
  CRDTOperation,
  Dot,
  isSerializable,
  toUserRow,
  ValidKey,
} from "./crdt.ts";
import {
  CLIENT_STATE_STORE,
  Lifecycle,
  OPERATIONS_STORE,
  ROWS_STORE,
} from "./indexeddb/lifecycle.ts";
import { RowStore } from "./indexeddb/rowStore.ts";
import { OperationLog } from "./indexeddb/operationLog.ts";
import { Index, QueryCondition } from "./indexes.ts";
import { asc, Direction, resolveQueryArgs } from "./direction.ts";
import { PersistedLogicalClock } from "./persistedLogicalClock.ts";
import { ClientState } from "./indexeddb/clientState.ts";
import {
  type SourceFilter,
  SubscriptionCallbackHandler,
  TableSubscriptions,
} from "./tableSubscriptions.ts";
import { assert } from "@maxhill/stdx";
import { abortFailedTransaction } from "./utils.ts";

type TableDependencies = {
  lifecycle: Lifecycle;
  rowStore: RowStore;
  operationLog: OperationLog;
  clientId: string;
  logicalClock: PersistedLogicalClock;
  clientState: ClientState;
  tableSubscriptions: TableSubscriptions;
};

export class Table<TIndexes extends Record<string, string[]> = Record<string, string[]>> {
  private tableName: string;
  private indexes: Map<string, string[]>;
  private lifecycle: Lifecycle;
  private rowStore: RowStore;
  private operationLog: OperationLog;
  private clientId: string;
  private logicalClock: PersistedLogicalClock;
  private clientState: ClientState;
  private tableSubscriptions: TableSubscriptions;

  constructor(
    tableName: string,
    indexes: Map<string, string[]>,
    dependencies: TableDependencies,
  ) {
    this.tableName = tableName;
    this.indexes = indexes;
    this.lifecycle = dependencies.lifecycle;
    this.rowStore = dependencies.rowStore;
    this.operationLog = dependencies.operationLog;
    this.clientId = dependencies.clientId;
    this.logicalClock = dependencies.logicalClock;
    this.clientState = dependencies.clientState;
    this.tableSubscriptions = dependencies.tableSubscriptions;
  }

  subscribe(
    handler: SubscriptionCallbackHandler,
    source: SourceFilter = "all",
  ): () => void {
    return this.tableSubscriptions.subscribe(this.tableName, handler, source);
  }

  async setRow(rowKey: ValidKey, value: Record<string, any>): Promise<void> {
    if (value._key) {
      assert(
        value._key === rowKey,
        `Cannot set _key to a different value than the row key. ` +
          `Expected '_key' to be '${rowKey}' but got '${value._key}'. ` +
          `The _key field is reserved and managed automatically.`,
      );
      // Strip _key before storing
      const { _key, ...cleanData } = value;
      value = cleanData;
    }

    const tx = this.lifecycle.transaction(
      [CLIENT_STATE_STORE, ROWS_STORE, OPERATIONS_STORE],
      "readwrite",
    );

    try {
      const row = await this.rowStore.getRow(tx, this.tableName, rowKey);

      const { dot, mutationID } = await this.nextMutation(tx);
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: this.tableName,
        rowKey,
        fields: value,
        dot,
      };

      applyOperationToRow(row, operation);

      await Promise.all([
        this.rowStore.saveRow(tx, row),
        this.operationLog.saveLocalPendingOperation(tx, operation, mutationID),
      ]);
      await this.lifecycle.commit(tx);
      this.tableSubscriptions.notify(this.tableName, "local");
    } catch (error) {
      abortFailedTransaction(tx);
      throw error;
    }
  }

  async setField(rowKey: ValidKey, field: any, value: any): Promise<void> {
    assert(
      field !== "_key",
      `Cannot set _key field directly. ` +
        `The _key field is reserved and managed automatically.`,
    );
    assert(
      isSerializable(value),
      "Field value must be JSON-serializable",
    );

    const tx = this.lifecycle.transaction(
      ["clientState", "rows", "operations"],
      "readwrite",
    );

    try {
      const row = await this.rowStore.getRow(tx, this.tableName, rowKey);

      const { dot, mutationID } = await this.nextMutation(tx);
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: this.tableName,
        rowKey,
        fields: { [field]: value },
        dot,
      };

      applyOperationToRow(row, operation);

      await Promise.all([
        this.rowStore.saveRow(tx, row),
        this.operationLog.saveLocalPendingOperation(tx, operation, mutationID),
      ]);
      await this.lifecycle.commit(tx);
      this.tableSubscriptions.notify(this.tableName, "local");
    } catch (error) {
      abortFailedTransaction(tx);
      throw error;
    }
  }

  async deleteRow(rowKey: ValidKey) {
    const tx = this.lifecycle.transaction(["clientState", "rows", "operations"], "readwrite");

    try {
      const row = await this.rowStore.getRow(tx, this.tableName, rowKey);

      // A local delete observes all retained writes, not only the visible winners.
      const versionVector: Record<string, number> = { ...row.tombstone?.versionVector };
      for (const fieldState of Object.values(row.fields)) {
        for (const candidate of [fieldState, ...(fieldState.contenders ?? [])]) {
          const clientId = candidate.dot.clientId;
          versionVector[clientId] = Math.max(versionVector[clientId] ?? 0, candidate.dot.version);
        }
      }

      const { dot, mutationID } = await this.nextMutation(tx);
      const operation: CRDTOperation = {
        type: "removeRow",
        tableName: this.tableName,
        rowKey,
        dot,
        versionVector,
      };

      applyOperationToRow(row, operation);

      await Promise.all([
        this.rowStore.saveRow(tx, row),
        this.operationLog.saveLocalPendingOperation(tx, operation, mutationID),
      ]);
      await this.lifecycle.commit(tx);
      this.tableSubscriptions.notify(this.tableName, "local");
    } catch (error) {
      abortFailedTransaction(tx);
      throw error;
    }
  }

  //  ------------------------------------------------------------------------
  //  Access
  //  ------------------------------------------------------------------------
  async get(rowKey: ValidKey): Promise<Record<string, any> | undefined> {
    const tx = this.lifecycle.transaction(["rows"], "readonly");
    const row = await this.rowStore.getRow(tx, this.tableName, rowKey);

    return toUserRow(row);
  }

  async *query(
    conditionOrDirection: QueryCondition | Direction = { type: "all" },
    direction: Direction = asc,
  ): AsyncGenerator<Record<string, any>, void, unknown> {
    const { condition, idbDirection } = resolveQueryArgs(conditionOrDirection, direction);

    const tx = this.lifecycle.transaction([ROWS_STORE], "readonly");
    const queryIterator = this.rowStore.query(
      tx,
      this.tableName,
      condition,
      undefined,
      idbDirection,
    );

    for await (const row of queryIterator) {
      const result = toUserRow(row);
      if (!result) {
        continue;
      }
      yield result;
    }
  }

  index<TIndexName extends keyof TIndexes & string>(indexName: TIndexName): Index {
    assert(
      this.indexes.has(indexName),
      `Table ${this.tableName} does not have an index called ${indexName}`,
    );
    return new Index(this.tableName, indexName, this.lifecycle);
  }

  //  ------------------------------------------------------------------------
  //  Private
  //  ------------------------------------------------------------------------
  private async nextMutation(tx: IDBTransaction): Promise<{ dot: Dot; mutationID: number }> {
    const mutationID = await this.clientState.allocateMutationID(tx);
    const version = await this.logicalClock.tick(tx);
    return { dot: { clientId: this.clientId, version }, mutationID };
  }
}
