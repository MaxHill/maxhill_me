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
