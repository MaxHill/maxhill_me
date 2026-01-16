/**
 * Wrap a IDBRequest in a promise for convenience
 * @param tx - Transaction to use.
 * @returns Promise with the Request result on resolve
 */
export async function promisifyIDBRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (event) => {
      if (!event.target) return reject("No event target returned");
      return resolve((event.target as IDBRequest).result);
    };
    req.onerror = (event) => {
      reject(event.target);
    };
  });
}

/**
 * Wait for a transaction to complete
 * @param tx - Transaction to use.
 * @returns Promise that can be awaited
 */
export async function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(
        new Error(
          `Transaction aborted. ` +
            `Error: ${tx.error?.message || "unknown"}. ` +
            `This usually indicates a constraint violation or concurrent modification.`,
        ),
      );
  });
}

/**
 * Wrap a IDBRequest<IDBCursorWithValue> in a async Iterator for convenience
 * @param request - IDBRequest to iterate over
 * @returns AsyncIterableIterator over the result
 */
export function asyncCursorIterator<T>(
  request: IDBRequest<IDBCursorWithValue | null>,
): AsyncIterableIterator<T> {
  return (async function* () {
    let cursor: IDBCursorWithValue | null = await new Promise(
      (resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );

    while (cursor) {
      yield cursor.value as T;
      cursor = await new Promise<IDBCursorWithValue | null>(
        (resolve, reject) => {
          cursor!.continue();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );
    }
  })();
}

export function validateTransactionStores(
  tx: IDBTransaction,
  requiredStores: string[],
  requiredMode?: IDBTransactionMode,
): void {
  const missing = requiredStores.filter((s) => !tx.objectStoreNames.contains(s));
  if (missing.length > 0) {
    throw new Error(
      `Transaction missing required stores: ${missing.join(", ")}.\n` +
        `Required: [${requiredStores.join(", ")}]\n` +
        `Available: [${[...tx.objectStoreNames].join(", ")}]\n` +
        `Create transaction with: repository.transaction([${requiredStores.join(", ")}], "${
          requiredMode || "readonly"
        }")`,
    );
  }

  if (requiredMode && tx.mode !== requiredMode) {
    throw new Error(
      `Transaction mode is "${tx.mode}" but "${requiredMode}" required.\n` +
        `This method modifies data and needs write access.`,
    );
  }
}
