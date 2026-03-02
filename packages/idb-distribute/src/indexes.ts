import { CLIENT_STATE_STORE, INDEXES_HASH, ROWS_STORE } from "./IDBRepository.ts";
import { TABLE_NAME } from "./crdt.ts";
import { promisifyIDBRequest, validateTransactionStores } from "./utils.ts";

export interface IndexDefinition {
  name: string;
  table: string;
  keys: string[]; // Field names, e.g., ["age"] or ["age", "name"]
}

export function indexDefinitionToIDBIndex(index: IndexDefinition): [string, string[]] {
  const internalIndexName = `${index.table}_${index.name}`;

  // Build key path: [tableName, field1.value, field2.value, ...]
  const keyPath = [
    TABLE_NAME, // "table_name"
    ...index.keys.map((key) => `fields.${key}.value`),
  ];

  return [internalIndexName, keyPath];
}

export function hashIndexDefinitions(indexes: IndexDefinition[] = []) {
  return indexes
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .reduce((acc, index) => {
      const curr = Object.entries(index)
        .sort(([k1], [k2]) => k1.localeCompare(k2))
        .reduce((s, [key, value]) => {
          const v = Array.isArray(value) ? value.join(",") : value;
          return s + `${key}:${v}|`;
        }, "");

      return acc + curr + ";";
    }, "");
}

export async function needIndexUpdate(
  tx: IDBTransaction,
  indexes: IndexDefinition[] = [],
): Promise<boolean> {
  validateTransactionStores(tx, [CLIENT_STATE_STORE]);

  const store = tx.objectStore(CLIENT_STATE_STORE);
  const currentHash = await promisifyIDBRequest(store.get(INDEXES_HASH));
  const nextHash = hashIndexDefinitions(indexes);

  return currentHash !== nextHash;
}
