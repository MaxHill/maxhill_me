import { assert } from "@maxhill/stdx";
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
    assert(row, "Row must be set when saving a row");
    assert(row.fields, "Row must have fields when saving a row");
    assert(row[TABLE_NAME], "table name must be set when saving row");
    assert(row[TABLE_NAME].length > 0, "table name must be set when saving row");
    assert(row[ROW_KEY], "row key must be set when saving row");
    assert(row[ROW_KEY].length > 0, "row key must be set when saving row");

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
    assert(tableName, "tableName must be set when getting row");
    assert(tableName.length > 0, "tableName must be set when getting row");
    assert(rowKey, "RowKey must be set when getting Row");

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
    assert(
      !indexName || indexNames.includes(indexName),
      `Specified index ${indexName} does not exist in indexes:/n${
        indexNames.map((index) => `   ${index} /n`)
      }`,
    );

    let source: IDBObjectStore | IDBIndex = tx.objectStore(ROWS_STORE);
    if (indexName) {
      source = source.index(createIndexName(table, indexName));
    }

    const range = queryToIDBRange(table, query);
    const cursorRequest = source.openCursor(range, direction);
    return asyncCursorIterator<ORMapRow>(cursorRequest);
  }
}
