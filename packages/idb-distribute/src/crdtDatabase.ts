import { IDBRepository } from "./IDBRepository";
import { applyOpToRow, CRDTOperation, Dot, LWWField, ORMapRow, ValidKey } from "./crdt";
import { PersistedLogicalClock } from "./persistedLogicalClock";
import { txDone } from "./utils";

export class CRDTDatabase {
  private clientId: string;
  private idbRepository: IDBRepository;
  private logicalClock: PersistedLogicalClock;

  constructor(
    private dbName: string = "crdt-db",
    generateId: () => string = crypto.randomUUID.bind(crypto),
    clientPersistance = new IDBRepository(),
  ) {
    this.idbRepository = clientPersistance;
    this.logicalClock = new PersistedLogicalClock(this.idbRepository);
    this.clientId = generateId();
  }

  async open(): Promise<void> {
    await this.idbRepository.open(this.dbName);
    await this.loadClientState();
  }

  private async loadClientState(): Promise<void> {
    const tx = this.idbRepository!.transaction(["clientState"], "readwrite");
    const clientState = await this.idbRepository.getClientState(tx);
    if (clientState.clientId) {
      this.clientId = clientState.clientId;
    } else {
      await this.idbRepository.saveClientId(tx, this.clientId);
    }
    await txDone(tx);
  }

  private async nextDot(): Promise<Dot> {
    if (!this.idbRepository) {
      throw new Error("idbRepository is undefined in nextDot");
    }
    const tx = this.idbRepository?.transaction("clientState", "readwrite");
    const version = await this.logicalClock.tick(tx);
    return { clientId: this.clientId, version };
  }

  /**
   * Set a single field in a row
   */
  async setCell(table: string, rowKey: ValidKey, field: string, value: any): Promise<void> {
    const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
    const row = await this.idbRepository.getRow(tx, table, rowKey);

    const dot = await this.nextDot();
    const op: CRDTOperation = {
      type: "set",
      table,
      rowKey,
      field,
      value,
      dot,
    };

    applyOpToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, table, rowKey, row),
      this.idbRepository.logOperation(tx, op),
      txDone(tx),
    ]);
  }

  /**
   * Set an entire row
   */
  async setRow(table: string, rowKey: ValidKey, value: Record<string, any>): Promise<void> {
    const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
    const row = await this.idbRepository.getRow(tx, table, rowKey);

    const dot = await this.nextDot();
    const op: CRDTOperation = {
      type: "setRow",
      table,
      rowKey,
      value,
      dot,
    };

    applyOpToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, table, rowKey, row),
      this.idbRepository.logOperation(tx, op),
      txDone(tx),
    ]);
  }

  /**
   * Get a row's user-facing data
   */
  async get(table: string, rowKey: ValidKey): Promise<Record<string, any> | undefined> {
    const tx = this.idbRepository.transaction(["rows"], "readonly");
    const row = await this.idbRepository.getRow(tx, table, rowKey);

    if (Object.keys(row.fields).length === 0) {
      return undefined;
    }

    const result: Record<string, any> = {};
    for (const [field, fieldState] of Object.entries(row.fields)) {
      result[field] = fieldState.value;
    }
    return result;
  }

  /**
   * Delete a row
   */
  async deleteRow(table: string, rowKey: ValidKey): Promise<void> {
    const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
    const row = await this.idbRepository.getRow(tx, table, rowKey);

    // Build context from current fields
    const context: Record<string, number> = {};
    for (const fieldState of Object.values(row.fields)) {
      const clientId = fieldState.dot.clientId;
      context[clientId] = Math.max(context[clientId] ?? 0, fieldState.dot.version);
    }

    const dot = await this.nextDot();
    const op: CRDTOperation = {
      type: "remove",
      table,
      rowKey,
      dot,
      context,
    };

    applyOpToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, table, rowKey, row),
      this.idbRepository.logOperation(tx, op),
      txDone(tx),
    ]);
  }

  /**
   * Get all rows in a table (uses IndexedDB index)
   */
  async getAllRows(table: string): Promise<Map<IDBValidKey, Record<string, any>>> {
    const tx = this.idbRepository!.transaction(["rows"], "readonly");
    const store = tx.objectStore("rows");
    const index = store.index("by-table");
    const request = index.getAll(table);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = new Map<IDBValidKey, Record<string, any>>();

        for (const record of request.result) {
          if (Object.keys(record.row.fields).length > 0) {
            const rowData: Record<string, any> = {};
            for (const [field, fieldState] of Object.entries(record.row.fields)) {
              rowData[field] = (fieldState as LWWField).value;
            }
            result.set(record.rowKey, rowData);
          }
        }

        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Apply remote operations (from sync)
   */
  private async applyRemoteOps(ops: CRDTOperation[]): Promise<void> {
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
    }

    const tx = this.idbRepository.transaction(["rows"], "readwrite");
    for (const [_key, rowOps] of opsByRow) {
      const firstOp = rowOps[0];
      const row = await this.idbRepository.getRow(tx, firstOp.table, firstOp.rowKey);

      for (const op of rowOps) {
        applyOpToRow(row, op);
      }

      await this.idbRepository.saveRow(tx, firstOp.table, firstOp.rowKey, row);
    }
    await txDone(tx);
  }

  async close(): Promise<void> {
    this.idbRepository.close();
  }
}
