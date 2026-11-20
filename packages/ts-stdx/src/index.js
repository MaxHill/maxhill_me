/**
 * Stops execution when a programmer invariant is false.
 *
 * @param condition The invariant that must be true.
 * @param message The failure message.
 */
export function assert(condition, message = "Assertion failed") {
    if (!condition) {
        throw new Error(message);
    }
}
/**
 * Wrap a IDBRequest in a promise for convenience
 * @param request - Request to wait for.
 * @returns Promise with the Request result on resolve
 */
export function promisifyIDBRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
            assert(event.target, "No event target returned");
            return resolve(event.target.result);
        };
        request.onerror = (event) => {
            reject(event.target);
        };
    });
}
/**
 * Wrap an IDBTransaction in a promise that resolves when it commits.
 * @param tx - Transaction to wait for.
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
/**
 * Wrap a IDBRequest<IDBCursorWithValue> in a async Iterator for convenience
 * @param request - IDBRequest to iterate over
 * @returns AsyncIterableIterator over the result
 */
export function asyncCursorIterator(request) {
    return (async function* () {
        let cursor = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        while (cursor) {
            yield cursor.value;
            cursor = await new Promise((resolve, reject) => {
                cursor.continue();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
    })();
}
