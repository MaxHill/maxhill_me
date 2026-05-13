import { QueryCondition } from "./indexes.ts";

//  ------------------------------------------------------------------------
//  Direction
//  ------------------------------------------------------------------------

/**
 * Iteration direction marker. Use the exported `asc` and `desc` constants
 * rather than constructing these objects directly.
 */
export type Direction = { readonly __direction: "asc" | "desc" };

/**
 * Ascending iteration direction (default). Pass to `query()` to iterate
 * rows from smallest to largest key.
 *
 * @example
 * ```typescript
 * table.query(asc)
 * table.index("byCreatedAt").query(below(now), asc)
 * ```
 */
export const asc: Direction = { __direction: "asc" };

/**
 * Descending iteration direction. Pass to `query()` to iterate
 * rows from largest to smallest key (newest-first when the key is a timestamp).
 *
 * @example
 * ```typescript
 * table.query(desc)
 * table.index("byCreatedAt").query(desc)
 * table.index("byCreatedAt").query(below(now), desc)
 * ```
 */
export const desc: Direction = { __direction: "desc" };

function isDirection(value: unknown): value is Direction {
  return typeof value === "object" && value !== null && "__direction" in value;
}

/**
 * Resolves the overloaded `query(condition?, direction?)` arguments into a
 * concrete `QueryCondition` and IndexedDB cursor direction.
 *
 * @internal
 */
export function resolveQueryArgs(
  conditionOrDirection: QueryCondition | Direction,
  direction: Direction = asc,
): { condition: QueryCondition; idbDirection: IDBCursorDirection } {
  if (isDirection(conditionOrDirection)) {
    return {
      condition: { type: "all" },
      idbDirection: conditionOrDirection.__direction === "desc" ? "prev" : "next",
    };
  }
  return {
    condition: conditionOrDirection,
    idbDirection: direction.__direction === "desc" ? "prev" : "next",
  };
}
