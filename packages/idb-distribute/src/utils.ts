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
export async function txDone(tx: IDBTransaction): Promise<null> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(null);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject("Transaction aborted");
  });
}
