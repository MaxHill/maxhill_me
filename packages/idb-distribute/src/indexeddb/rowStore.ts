import { ORMapRow, ROW_KEY, TABLE_NAME, ValidKey } from "../crdt.ts";
import {
  createIndexName,
  IndexDefinition,
  QueryCondition,
  queryToIDBRange,
} from "../indexes.ts";
import { asyncCursorIterator, promisifyIDBRequest, validateTransactionStores } from "../utils.ts";
import { ROWS_STORE } from "./lifecycle.ts";

export class RowStore {
  indexes?: IndexDefinition[];

  constructor(indexes?: IndexDefinition[]) {
    if (indexes) this.indexes = indexes;
  }

  async saveRow(tx: IDBTransaction, row: ORMapRow): Promise<void> {
    validateTransactionStores(tx, [ROWS_STORE]);
    if (row[TABLE_NAME].length <= 0 || !row[TABLE_NAME]) {
      throw new Error("table name must be set when saving row");
    }
    if (row[ROW_KEY].length <= 0 || !row[ROW_KEY]) {
      throw new Error("row key must be set when saving row");
    }
    if (!row) throw new Error("Row must be set when saving a row");
    if (!row.fields) throw new Error("Row must have fields when saving a row");

    const store = tx.objectStore(ROWS_STORE);

    // TODO: Move business logic to CRDTDatabase
    if (Object.keys(row.fields).length > 0 || row.tombstone) {
      await promisifyIDBRequest(store.put(row));
    } else {
      await promisifyIDBRequest(store.delete([
        row[TABLE_NAME],
        row[ROW_KEY] as IDBValidKey,
      ]));
    }
  }

  async getRow(tx: IDBTransaction, tableName: string, rowKey: ValidKey): Promise<ORMapRow> {
    validateTransactionStores(tx, [ROWS_STORE]);
    if (tableName.length <= 0 || !tableName) {
      throw new Error("tableName must be set when getting row");
    }
    if (!rowKey) throw new Error("RowKey must be set when getting Row");

    const store = tx.objectStore(ROWS_STORE);
    const result = await promisifyIDBRequest(store.get([
      tableName,
      rowKey as IDBValidKey,
    ]));

    return result ?? { [TABLE_NAME]: tableName, [ROW_KEY]: rowKey, fields: {} };
  }

  query(
    tx: IDBTransaction,
    table: string,
    query: QueryCondition,
    indexName?: string,
    direction: IDBCursorDirection = "next",
  ): AsyncIterableIterator<ORMapRow> {
    validateTransactionStores(tx, [ROWS_STORE]);
    const indexNames = (this.indexes || []).map((index) => index.name);
    if (indexName && !indexNames.includes(indexName)) {
      throw new Error(
        `Specified index ${indexName} does not exist in indexes:/n${
          indexNames.map((index) => `   ${index} /n`)
        }`,
      );
    }

    let source: IDBObjectStore | IDBIndex = tx.objectStore(ROWS_STORE);
    if (indexName) {
      source = source.index(createIndexName(table, indexName));
    }

    const range = queryToIDBRange(table, query);
    const cursorRequest = source.openCursor(range, direction);
    return asyncCursorIterator<ORMapRow>(cursorRequest);
  }
}
