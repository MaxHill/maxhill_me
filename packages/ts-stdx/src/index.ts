/**
 * Stops execution when a programmer invariant is false.
 *
 * @param condition The invariant that must be true.
 * @param message The failure message.
 */
export function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
