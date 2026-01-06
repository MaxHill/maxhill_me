import { applyOpToRow, CRDTOperation, Dot, LWWField, ORMapRow, ValidKey } from "./crdt";
import * as logicalClock from "./persistedLogicalClock";

export class CRDTDatabase {
  // TODO: should be private but needed for logical clock test
  db: IDBDatabase | null = null;
  private clientId: string;

  constructor(
    private dbName: string = "crdt-db",
    generateId: () => string = crypto.randomUUID.bind(crypto),
  ) {
    this.clientId = generateId();
  }

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadClientState().then(resolve);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store individual rows
        if (!db.objectStoreNames.contains("rows")) {
          const rowStore = db.createObjectStore("rows", { keyPath: ["tableName", "rowKey"] });
          rowStore.createIndex("by-table", "tableName", { unique: false });
        }

        // Store operations log
        if (!db.objectStoreNames.contains("operations")) {
          const opStore = db.createObjectStore("operations", {
            keyPath: "id",
            autoIncrement: true,
          });
          opStore.createIndex("by-synced", "synced", { unique: false });
          opStore.createIndex("by-timestamp", "timestamp", { unique: false });
        }

        // Store client state
        if (!db.objectStoreNames.contains("clientState")) {
          const s = db.createObjectStore("clientState");
          // clientId
          // counter
          // logicalClock
          s.put(-1, "logicalClock");
        }
      };
    });
  }

  private async loadClientState(): Promise<void> {
    const tx = this.db!.transaction(["clientState"], "readonly");
    const store = tx.objectStore("clientState");

    const clientIdReq = store.get("clientId");

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        if (clientIdReq.result) {
          this.clientId = clientIdReq.result;
        } else {
          this.saveClientId();
        }

        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  private async saveClientId(): Promise<void> {
    const tx = this.db!.transaction(["clientState"], "readwrite");
    const store = tx.objectStore("clientState");
    store.put(this.clientId, "clientId");

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async nextDot(): Promise<Dot> {
    if (!this.db) {
      throw new Error("Database is undefined in nextDot");
    }
    const tx = this.db?.transaction("clientState", "readwrite");
    const version = await logicalClock.tick(tx);
    return { clientId: this.clientId, version };
  }

  /**
   * Get a single row from IndexedDB
   */
  private async getRow(tableName: string, rowKey: ValidKey): Promise<ORMapRow> {
    const tx = this.db!.transaction(["rows"], "readonly");
    const store = tx.objectStore("rows");
    const request = store.get([
      tableName,
      rowKey as IDBValidKey, /*Casting is fine here since ValidKey is a subset of IDBValidKey*/
    ]);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result?.row ?? { fields: {} });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save a single row to IndexedDB
   */
  private async saveRow(tableName: string, rowKey: ValidKey, row: ORMapRow): Promise<void> {
    const tx = this.db!.transaction(["rows"], "readwrite");
    const store = tx.objectStore("rows");

    // Only save if the row has data or a tombstone
    if (Object.keys(row.fields).length > 0 || row.tombstone) {
      store.put({ tableName, rowKey, row });
    } else {
      // Remove empty rows
      store.delete([
        tableName,
        rowKey as IDBValidKey, /*Casting is fine here since ValidKey is a subset of IDBValidKey*/
      ]);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async logOperation(op: CRDTOperation): Promise<void> {
    const tx = this.db!.transaction(["operations"], "readwrite");
    const store = tx.objectStore("operations");
    store.add({
      op,
      timestamp: Date.now(),
      synced: false,
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Set a single field in a row
   */
  async setCell(table: string, rowKey: ValidKey, field: string, value: any): Promise<void> {
    // Read only the specific row
    const row = await this.getRow(table, rowKey);

    const dot = await this.nextDot();
    const op: CRDTOperation = {
      type: "set",
      table,
      rowKey,
      field,
      value,
      dot,
    };

    // Apply operation to the row in memory
    applyOpToRow(row, op);

    // Save only this row back
    await Promise.all([
      this.saveRow(table, rowKey, row),
      this.logOperation(op),
    ]);
  }

  /**
   * Set an entire row
   */
  async setRow(table: string, rowKey: ValidKey, value: Record<string, any>): Promise<void> {
    // Read only the specific row
    const row = await this.getRow(table, rowKey);

    const dot = await this.nextDot();
    const op: CRDTOperation = {
      type: "setRow",
      table,
      rowKey,
      value,
      dot,
    };

    // Apply operation to the row in memory
    applyOpToRow(row, op);

    // Save only this row back
    await Promise.all([
      this.saveRow(table, rowKey, row),
      this.logOperation(op),
    ]);
  }

  /**
   * Get a row's user-facing data
   */
  async get(table: string, rowKey: ValidKey): Promise<Record<string, any> | undefined> {
    const row = await this.getRow(table, rowKey);

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
    const row = await this.getRow(table, rowKey);

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
      this.saveRow(table, rowKey, row),
      this.logOperation(op),
    ]);
  }

  /**
   * Get all rows in a table (uses IndexedDB index)
   */
  async getAllRows(table: string): Promise<Map<IDBValidKey, Record<string, any>>> {
    const tx = this.db!.transaction(["rows"], "readonly");
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
  async applyRemoteOps(ops: CRDTOperation[]): Promise<void> {
    // Group operations by row for efficiency
    const opsByRow = new Map<string, CRDTOperation[]>();

    for (const op of ops) {
      const key = `${op.table}:${String(op.rowKey)}`;
      if (!opsByRow.has(key)) {
        opsByRow.set(key, []);
      }
      opsByRow.get(key)!.push(op);
    }

    // Process each row
    for (const [_key, rowOps] of opsByRow) {
      const firstOp = rowOps[0];
      const row = await this.getRow(firstOp.table, firstOp.rowKey);

      // Apply all operations to this row
      for (const op of rowOps) {
        applyOpToRow(row, op);
      }

      // Save the row once
      await this.saveRow(firstOp.table, firstOp.rowKey, row);
    }
  }

  async close(): Promise<void> {
    this.db?.close();
  }
}
