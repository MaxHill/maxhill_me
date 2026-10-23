/**
 * Stops execution when a programmer invariant is false.
 *
 * @param {unknown} condition The invariant that must be true.
 * @param {string} message The failure message.
 */
export function assert(condition, message = "Assertion failed") {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Wrap an IDBRequest in a promise for convenience.
 * @param {IDBRequest} req - Request to use.
 * @returns {Promise<unknown>}
 */
export function promisifyIDBRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = (event) => {
      assert(event.target, "No event target returned");
      resolve(event.target.result);
    };
    req.onerror = (event) => reject(event.target);
  });
}

/**
 * Wrap an IDBTransaction in a promise that resolves when it commits.
 * @param {IDBTransaction} tx - Transaction to wait for.
 * @returns {Promise<void>}
 */
export function promisifyIDBTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.addEventListener("complete", () => resolve(), { once: true });
    const rejectTransaction = () => {
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };
    tx.addEventListener("error", rejectTransaction, { once: true });
    tx.addEventListener("abort", rejectTransaction, { once: true });
  });
}
