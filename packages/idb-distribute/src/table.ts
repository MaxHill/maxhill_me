import { applyOperationToRow, CRDTOperation, Dot, toUserRow, ValidKey } from "./crdt.ts";
import { CRDTDatabase } from "./crdtDatabase/index.ts";
import { CLIENT_STATE_STORE, IDBRepository, OPERATIONS_STORE, ROWS_STORE } from "./IDBRepository.ts";
import { Index, QueryCondition } from "./indexes.ts";
import { PersistedLogicalClock } from "./persistedLogicalClock.ts";

export class Table<TIndexes extends Record<string, string[]> = Record<string, string[]>> {
  private tableName: string;
  private indexes: Map<string, string[]>;
  private idbRepository: IDBRepository;
  private crdtDatabase: CRDTDatabase;
  private logicalClock: PersistedLogicalClock;

  constructor(
    tableName: string,
    indexes: Map<string, string[]>,
    idbRepository: IDBRepository,
    crdtDatabase: CRDTDatabase,
    logicalClock: PersistedLogicalClock,
  ) {
    this.tableName = tableName;
    this.indexes = indexes;
    this.idbRepository = idbRepository;
    this.crdtDatabase = crdtDatabase;
    this.logicalClock = logicalClock;
  }

  async setRow(rowKey: ValidKey, value: any): Promise<void> {
    if (value._key) {
      if (value._key !== rowKey) {
        throw new Error(
          `Cannot set _key to a different value than the row key. ` +
            `Expected '_key' to be '${rowKey}' but got '${value._key}'. ` +
            `The _key field is reserved and managed automatically.`,
        );
      }
      // Strip _key before storing
      const { _key, ...cleanData } = value;
      value = cleanData;
    }

    const tx = this.idbRepository.transaction(
      [CLIENT_STATE_STORE, ROWS_STORE, OPERATIONS_STORE],
      "readwrite",
    );
    const row = await this.idbRepository.getRow(tx, this.tableName, rowKey);

    const dot = await this.nextDot(tx);
    const op: CRDTOperation = {
      type: "setRow",
      table: this.tableName,
      rowKey,
      value,
      dot,
    };

    applyOperationToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
  }

  async setField(rowKey: ValidKey, field: any, value: any): Promise<void> {
    if (field === "_key") {
      throw new Error(
        `Cannot set _key field directly. ` +
          `The _key field is reserved and managed automatically.`,
      );
    }

    const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
    const row = await this.idbRepository.getRow(tx, this.tableName, rowKey);

    const dot = await this.nextDot(tx);
    const op: CRDTOperation = {
      type: "set",
      table: this.tableName,
      rowKey,
      field,
      value,
      dot,
    };

    applyOperationToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
  }
  async deleteRow(rowKey: ValidKey) {
    const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
    const row = await this.idbRepository.getRow(tx, this.tableName, rowKey);

    // Build context from current fields
    const context: Record<string, number> = {};
    for (const fieldState of Object.values(row.fields)) {
      const clientId = fieldState.dot.clientId;
      context[clientId] = Math.max(context[clientId] ?? 0, fieldState.dot.version);
    }

    const dot = await this.nextDot(tx);
    const op: CRDTOperation = {
      type: "remove",
      table: this.tableName,
      rowKey,
      dot,
      context,
    };

    applyOperationToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
  }

  //  ------------------------------------------------------------------------
  //  Access
  //  ------------------------------------------------------------------------
  async get(rowKey: ValidKey): Promise<Record<string, any> | undefined> {
    const tx = this.idbRepository.transaction(["rows"], "readonly");
    const row = await this.idbRepository.getRow(tx, this.tableName, rowKey);

    return toUserRow(row);
  }

  async *query(
    condition: QueryCondition = { type: "all" },
  ): AsyncGenerator<Record<string, any>, void, unknown> {
    const tx = this.idbRepository!.transaction([ROWS_STORE], "readonly");
    const queryIterator = this.idbRepository.query(tx, this.tableName, condition);

    for await (const row of queryIterator) {
      const result = toUserRow(row);
      if (!result) {
        continue;
      }
      yield result;
    }
  }

  index<TIndexName extends keyof TIndexes & string>(indexName: TIndexName): Index {
    if (!this.indexes.has(indexName)) {
      throw new Error(`Table ${this.tableName} does not have an index called ${indexName}`);
    }
    return new Index(this.tableName, indexName, this.idbRepository);
  }

  //  ------------------------------------------------------------------------
  //  Private
  //  ------------------------------------------------------------------------
  //  TODO: Move nextDot function to logicalClock
  private async nextDot(tx: IDBTransaction): Promise<Dot> {
    if (!this.idbRepository) {
      throw new Error("idbRepository is undefined in nextDot");
    }
    const version = await this.logicalClock.tick(tx);
    return { clientId: this.crdtDatabase.clientId, version };
  }
}
