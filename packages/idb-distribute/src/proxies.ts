import type { IDBPDatabase, IDBPTransaction } from "idb";
import type { InternalDbSchema } from "./db.ts";
import type { DBSchema } from "idb";
import type { WAL } from "./wal.ts";

// Separate types for internal operations vs user operations
type InternalStoreNames = keyof InternalDbSchema;
type AnyStoreNames = string;

// Generic proxy that handles both typed and dynamic operations
export function proxyIdb<TUserSchema extends DBSchema = {}>(
    db: IDBPDatabase<InternalDbSchema & TUserSchema>,
    wal: WAL
) {
    return new Proxy(db, {
        get(target, prop) {
            if (prop === 'transaction') {
                return function(storeNames: AnyStoreNames | AnyStoreNames[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) {
                    // For readwrite transactions, include all stores for WAL logging
                    // For readonly transactions, use requested stores only
                    const actualStoreNames = mode === 'readwrite'
                        ? Array.from(target.objectStoreNames) as AnyStoreNames[]
                        : Array.isArray(storeNames) ? storeNames : [storeNames];

                    // Type assertion needed here because we mix internal and user stores
                    const tx = target.transaction(actualStoreNames as any, mode, options);

                    return mode === 'readwrite'
                        ? proxyTransaction(tx, wal, storeNames)
                        : tx;
                };
            }

            // Top-level mutating methods
            if (['put', 'delete', 'add', 'clear'].includes(prop as string)) {
                return async function(storeName: string, value?: any, key?: IDBValidKey) {
                    const tx = target.transaction(Array.from(target.objectStoreNames), "readwrite");
                    const proxiedTx = proxyTransaction(tx, wal, storeName);
                    const store = proxiedTx.objectStore(storeName);

                    let returnValue
                    if (prop === 'put') returnValue = await store.put(value, key);
                    if (prop === 'delete') returnValue = await store.delete(value);
                    if (prop === 'add') returnValue = await store.add(value, key);
                    if (prop === 'clear') returnValue = await store.clear();

                    await proxiedTx.done
                    return returnValue
                };
            }

            const value = (target as any)[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        }
    }) as unknown as IDBPDatabase<InternalDbSchema & TUserSchema>;
}

function proxyTransaction(tx: any, wal: WAL, originalStoreNames: any) {
    return new Proxy(tx, {
        get(target, prop) {
            if (prop === 'store') {
                const isSingleStore = typeof originalStoreNames === 'string' ||
                    (Array.isArray(originalStoreNames) && originalStoreNames.length === 1);
                if (isSingleStore) {
                    const storeName = typeof originalStoreNames === 'string'
                        ? originalStoreNames
                        : originalStoreNames[0];
                    return proxyStore(target.objectStore(storeName), tx, wal, storeName);
                }
                return undefined;
            }

            if (prop === 'objectStore') {
                return (storeName: string) =>
                    proxyStore(target.objectStore(storeName), tx, wal, storeName);
            }

            if (prop === 'done') {
                return (async () => {
                    await wal.applyPendingOperations(tx);
                    return await target.done;
                })();
            }

            const value = (target as any)[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
}

function proxyStore(storeTarget: any, tx: any, wal: WAL, storeName: string) {
    return new Proxy(storeTarget, {
        get(target, prop) {
            if (prop === 'put') {
                return async (value: any, key?: IDBValidKey) => {
                    await wal.writeNewOperation(tx, {
                        operation: 'put',
                        table: storeName,
                        value, ...(key != null ? { valueKey: key } : {})
                    });

                    return key || value[target.keyPath] || "";
                };
            }

            if (prop === 'add') {
                return async (value: any, key?: IDBValidKey) => {
                    throw new Error("Add not supported")
                };
            }

            if (prop === 'delete') {
                return async (key: IDBValidKey | IDBKeyRange) => {
                    await wal.writeNewOperation(tx, {
                        operation: 'del',
                        table: storeName,
                        value: key
                    });
                };
            }

            if (prop === 'clear') {
                return async () => {
                    await wal.writeNewOperation(tx, {
                        operation: 'clear',
                        table: storeName,
                        value: null,
                    });
                    return undefined;
                };
            }

            if (prop === 'index') {
                return (indexName: string) => proxyIndex(target.index(indexName), tx, wal, storeName, indexName);
            }

            if (prop === 'openCursor') {
                return (...args: any[]) => proxyCursor(target.openCursor(...args), tx, wal, storeName);
            }

            if (prop === 'openKeyCursor') {
                return (...args: any[]) => proxyKeyCursor(target.openKeyCursor(...args), tx, wal, storeName);
            }

            const value = (target as any)[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
}

function proxyIndex(indexTarget: any, tx: any, wal: WAL, storeName: string, indexName: string) {
    return new Proxy(indexTarget, {
        get(target, prop) {
            if (prop === 'openCursor') {
                return (...args: any[]) => proxyCursor(target.openCursor(...args), tx, wal, storeName, indexName);
            }
            if (prop === 'openKeyCursor') {
                return (...args: any[]) => proxyKeyCursor(target.openKeyCursor(...args), tx, wal, storeName, indexName);
            }
            const value = (target as any)[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
}

async function proxyCursor(cursorPromise: Promise<IDBCursorWithValue>, tx: any, wal: WAL, storeName: string, indexName?: string) {
  const cursor = await cursorPromise;
  if (!cursor) return cursor;

  // override methods explicitly
  (cursor as any).update = async (value: any) => {
    const key = cursor.primaryKey;
    await wal.writeNewOperation(tx, {
      operation: "put",
      table: storeName,
      value,
      ...(key != null ? { valueKey: key } : {})
    });
    return key;
  };

  // override methods explicitly
  (cursor as any).delete = async () => {
    const key = cursor.primaryKey;
    await wal.writeNewOperation(tx, {
      operation: "del",
      table: storeName,
      value: key,
    });
    return undefined;
  };

  // (cursor as any).delete = async () => { throw new Error("Delete not implemented"); };

  return cursor;
}

async function proxyKeyCursor(cursorRequest: any, tx: any, wal: WAL, storeName: string, indexName?: string) {
    const cursor = await cursorRequest;
    if (!cursor) return cursor;

    // Force override delete
  (cursor as any).delete = async () => {
    const key = cursor.primaryKey;
    await wal.writeNewOperation(tx, {
      operation: "del",
      table: storeName,
      value: key,
    });
    return undefined;
  };

    return cursor;
}
