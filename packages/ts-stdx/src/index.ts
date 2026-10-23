/**
 * Stops execution when a programmer invariant is false.
 *
 * @param condition The invariant that must be true.
 * @param message The failure message.
 */
export function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Wrap a IDBRequest in a promise for convenience
 * @param tx - Transaction to use.
 * @returns Promise with the Request result on resolve
 */
export function promisifyIDBRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (event) => {
      assert(event.target, "No event target returned");
      return resolve((event.target as IDBRequest).result);
    };
    req.onerror = (event) => {
      reject(event.target);
    };
  });
}

/**
 * Wrap an IDBTransaction in a promise that resolves when it commits.
 * @param tx - Transaction to wait for.
 */
export function promisifyIDBTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener("complete", () => resolve(), { once: true });
    const rejectTransaction = () => {
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };
    tx.addEventListener("error", rejectTransaction, { once: true });
    tx.addEventListener("abort", rejectTransaction, { once: true });
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
