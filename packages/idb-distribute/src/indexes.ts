import { CLIENT_STATE_STORE, IDBRepository, INDEXES_HASH, ROWS_STORE } from "./IDBRepository.ts";
import { ROW_KEY, TABLE_NAME } from "./crdt.ts";
import { TableSchema } from "./table.ts";
import { promisifyIDBRequest, validateTransactionStores } from "./utils.ts";

export class Index {
  constructor(
    private tableName: string,
    private indexName: string,
    private idbRepository: IDBRepository,
  ) {
    const indexNames = (this.idbRepository.indexes || []).map((index) => index.name);
    if (!indexNames.includes(this.indexName)) {
      throw new Error(
        `Specified index ${indexName} does not exist in indexes:/n${
          indexNames.map((index) => `   ${index} /n`)
        }`,
      );
    }
  }

  async *query(condition: QueryCondition) {
    const indexNames = (this.idbRepository.indexes || []).map((index) => index.name);
    if (!indexNames.includes(this.indexName)) {
      throw new Error(
        `Invalid index ${this.indexName} does not exist in indexes:/n${
          indexNames.map((index) => `   ${index} /n`)
        }`,
      );
    }

    const tx = this.idbRepository!.transaction([ROWS_STORE], "readonly");
    const queryIterator = this.idbRepository.query(tx, this.tableName, this.indexName, condition);

    for await (const row of queryIterator) {
      // Skip rows with no fields (deleted rows) - consistent with get()
      // TODO: this should be fixed when writing the row
      if (Object.keys(row.fields).length === 0) {
        continue;
      }

      let result: Record<string, any> = {};
      for (const [field, fieldState] of Object.entries(row.fields)) {
        result[field] = fieldState.value;
      }

      result = Object.assign({ _key: row[ROW_KEY] }, result);
      yield result;
    }
  }
}

//  ------------------------------------------------------------------------
//  Index Query
//  ------------------------------------------------------------------------

/**
 * Query type for exact value matches.
 */
type QueryExact = {
  type: "exact";
  value: IDBValidKey;
};

/**
 * Creates a query that matches values exactly equal to the given value.
 *
 * Use this when you need to find records with a specific index value.
 *
 * @param value - The value to match exactly
 * @returns A query object for exact matching
 *
 * @example
 * ```typescript
 * // Find users aged exactly 30
 * const query = exact(30);
 *
 * // Find posts published on a specific date
 * const query = exact(new Date('2024-01-01'));
 *
 * // Find users with exact email
 * const query = exact('user@example.com');
 * ```
 */
export function exact(
  value: IDBValidKey,
): QueryExact {
  return { type: "exact", value };
}

/**
 * Query type for values above a threshold.
 */
type QueryAbove = {
  type: "above";
  value: IDBValidKey;
  options: { inclusive: boolean };
};

/**
 * Creates a query that matches values greater than (or equal to) the given value.
 *
 * By default, the boundary value is included (≥). Set `inclusive: false` to exclude it (>).
 *
 * @param value - The lower bound value
 * @param options - Query options
 * @param options.inclusive - If true (default), includes the boundary value (≥). If false, excludes it (>).
 * @returns A query object for range matching
 *
 * @example
 * ```typescript
 * // Find users aged 18 or older (inclusive by default)
 * const query = above(18);
 *
 * // Find users older than 18 (exclusive)
 * const query = above(18, { inclusive: false });
 *
 * // Find posts after a date (inclusive)
 * const query = above(new Date('2024-01-01'));
 * ```
 */
export function above(value: IDBValidKey, options = { inclusive: true }): QueryAbove {
  return { type: "above", options, value };
}

/**
 * Query type for values below a threshold.
 */
type QueryBelow = {
  type: "below";
  value: IDBValidKey;
  options: { inclusive: boolean };
};

/**
 * Creates a query that matches values less than (or equal to) the given value.
 *
 * By default, the boundary value is included (≤). Set `inclusive: false` to exclude it (<).
 *
 * @param value - The upper bound value
 * @param options - Query options
 * @param options.inclusive - If true (default), includes the boundary value (≤). If false, excludes it (<).
 * @returns A query object for range matching
 *
 * @example
 * ```typescript
 * // Find users aged 65 or younger (inclusive by default)
 * const query = below(65);
 *
 * // Find users younger than 65 (exclusive)
 * const query = below(65, { inclusive: false });
 *
 * // Find posts before a date (inclusive)
 * const query = below(new Date('2024-12-31'));
 * ```
 */
export function below(value: IDBValidKey, options = { inclusive: true }): QueryBelow {
  return { type: "below", options, value };
}

/**
 * Query type for values within a range between two bounds.
 */
type QueryBetween = {
  type: "between";
  lowerValue: IDBValidKey;
  upperValue: IDBValidKey;
  options: {
    inclusiveLower: boolean;
    inclusiveUpper: boolean;
  };
};

/**
 * Creates a query that matches values within a range between two bounds.
 *
 * By default, both boundaries are included (≤ value ≤). You can make either or both
 * boundaries exclusive using the options.
 *
 * @param lowerValue - The lower bound of the range
 * @param upperValue - The upper bound of the range
 * @param options - Query options
 * @param options.inclusiveLower - If true (default), includes the lower boundary value
 * @param options.inclusiveUpper - If true (default), includes the upper boundary value
 * @returns A query object for range matching
 *
 * @throws {Error} If lower and upper bounds are not the same type
 * @throws {Error} If lowerValue > upperValue for comparable types
 *
 * @example
 * ```typescript
 * // Find users aged 18-65 (inclusive on both ends by default)
 * const query = between(18, 65);
 *
 * // Find users aged 18-65 (exclusive on both ends: 18 < age < 65)
 * const query = between(18, 65, {
 *   inclusiveLower: false,
 *   inclusiveUpper: false
 * });
 *
 * // Find posts in a date range (inclusive lower, exclusive upper)
 * const query = between(
 *   new Date('2024-01-01'),
 *   new Date('2024-02-01'),
 *   { inclusiveLower: true, inclusiveUpper: false }
 * );
 * ```
 */
export function between(
  lowerValue: IDBValidKey,
  upperValue: IDBValidKey,
  options = {
    inclusiveLower: true,
    inclusiveUpper: true,
  },
): QueryBetween {
  const lowerType = lowerValue instanceof Date ? "date" : typeof lowerValue;
  const upperType = upperValue instanceof Date ? "date" : typeof upperValue;

  if (lowerType !== upperType) {
    throw new Error(
      `Type mismatch: lower bound is ${lowerType} but upper bound is ${upperType}. ` +
        `Both bounds must be the same type.`,
    );
  }

  // Also validate ordering
  if (typeof lowerValue === "number" && typeof upperValue === "number" && lowerValue > upperValue) {
    throw new Error(
      `Invalid range: lowerValue (${lowerValue}) must be ≤ upperValue (${upperValue}).`,
    );
  }
  return { type: "between", lowerValue, upperValue, options };
}

/**
 * Union type representing all possible index query types.
 *
 * Use the query builder functions (exact, above, below, between) to create queries
 * rather than constructing these objects directly.
 */
export type QueryCondition = QueryAbove | QueryBelow | QueryBetween | QueryExact;

//  ------------------------------------------------------------------------
//  Conversion
//  ------------------------------------------------------------------------
const STRING_MIN_BOUND = "";
const STRING_MAX_BOUND = "\uffff".repeat(1000); // High Unicode character repeated for string upper bound
const DATE_MIN_BOUND = new Date(-8640000000000000);
const DATE_MAX_BOUND = new Date(8640000000000000);

interface RangeBounds {
  min: IDBValidKey;
  max: IDBValidKey;
}

/**
 * Calculate appropriate min/max bounds for IndexedDB ranges based on a sample value's type.
 *
 * @param sampleValue - A sample value of the same type as the indexed field
 * @returns An object with min and max bounds appropriate for the value's type
 * @throws Error if the value type is not supported by IndexedDB keys
 */
export function calculateBounds(sampleValue: IDBValidKey): RangeBounds {
  if (typeof sampleValue === "number") {
    if (!Number.isFinite(sampleValue)) {
      throw new Error(
        `Invalid number for IndexedDB key: ${sampleValue}. ` +
          `IndexedDB keys must be finite numbers.`,
      );
    }
    return { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER };
  }

  if (typeof sampleValue === "string") {
    return { min: STRING_MIN_BOUND, max: STRING_MAX_BOUND };
  }

  if (sampleValue instanceof Date) {
    if (isNaN(sampleValue.getTime())) {
      throw new Error(
        `Invalid Date object: Date has NaN timestamp. ` +
          `Ensure Date is constructed with valid input.`,
      );
    }
    return { min: DATE_MIN_BOUND, max: DATE_MAX_BOUND };
  }

  // ArrayBuffer, TypedArrays, or Arrays would go here if needed
  if (Array.isArray(sampleValue)) {
    // TODO: this should be done somewhere else so we don't get to this point.
    // Either find a way to calculate this or disallow these types of values
    throw new Error(
      "Cannot calculate bounds for Array values. " +
        "Array-typed indexes require explicit min/max values.",
    );
  }

  throw new Error(
    `Unsupported value type for IndexedDB key: ${typeof sampleValue}. ` +
      `Supported types: number, string, Date`,
  );
}

/**
 * Converts a query payload into an IndexedDB IDBKeyRange for use in index queries.
 *
 * This function translates the high-level query objects created by the query builder
 * functions (exact, above, below, between) into low-level IDBKeyRange objects that
 * IndexedDB can use for efficient index scans.
 *
 * The resulting range includes the table name as the first component of the key,
 * enabling multi-table indexes in a single object store.
 *
 * @param table - The table name to include in the range keys
 * @param query - The query object to convert
 * @returns An IDBKeyRange configured according to the query
 *
 * @throws {Error} If the query type is unsupported or invalid
 * @throws {Error} If bounds are equal with any exclusive bound
 * @throws {Error} If the value type is not supported (see calculateBounds)
 *
 * @internal This function is primarily for internal use by the query execution system.
 */
export function queryToIDBRange(table: string, query: QueryCondition) {
  if (query.type === "exact") {
    return IDBKeyRange.only([table, query.value]);
  }

  // Get a sample value from the query to determine bounds
  const sampleValue = query.type === "between"
    ? query.lowerValue
    : query.type === "above" || query.type === "below"
    ? query.value
    : undefined;

  if (sampleValue === undefined) {
    throw new Error("Unable to determine value from query");
  }

  const bounds = calculateBounds(sampleValue);

  if (query.type === "above") {
    return IDBKeyRange.bound(
      [table, query.value],
      [table, bounds.max],
      !query.options.inclusive, // lowerOpen - invert because inclusive means closed
      false,
    );
  } else if (query.type === "below") {
    const lower = [table, bounds.min];
    const upper = [table, query.value];
    const lowerOpen = false;
    const upperOpen = !query.options.inclusive;

    // Validate: can't have same bounds with any open
    // IDBKeyRange.bound throws if lower === upper and either bound is open
    if (keysEqual(bounds.min, query.value) && (lowerOpen || upperOpen)) {
      throw new Error(
        `Invalid range: Cannot create a range where lower and upper bounds are equal (${
          JSON.stringify(query.value)
        }) ` +
          `with any bound exclusive. Both bounds must be inclusive.`,
      );
    }

    return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
  } else if (query.type === "between") {
    const lower = [table, query.lowerValue];
    const upper = [table, query.upperValue];
    const lowerOpen = !query.options.inclusiveLower;
    const upperOpen = !query.options.inclusiveUpper;

    // Validate: can't have same bounds with any open
    // IDBKeyRange.bound throws if lower === upper and either bound is open
    if (keysEqual(query.lowerValue, query.upperValue) && (lowerOpen || upperOpen)) {
      throw new Error(
        `Invalid range: Cannot create a range where lower and upper bounds are equal (${
          JSON.stringify(query.lowerValue)
        }) ` +
          `with any bound exclusive. Both bounds must be inclusive.`,
      );
    }

    return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
  }

  throw new Error(
    `Query type not supported: ${
      query["type"] || '""'
    }. \n  Supported types: exact, above, below, between`,
  );
}

//  ------------------------------------------------------------------------
//  Index Definition
//  ------------------------------------------------------------------------

/**
 * Configuration for creating an index on a table.
 *
 * Indexes enable efficient querying of records by specific field values.
 * Multi-field indexes (compound indexes) can be created by specifying multiple keys.
 */
export interface IndexDefinition {
  /** The name of the index (must be unique within the table) */
  name: string;
  /** The table this index belongs to */
  table: string;
  /** Field names to index, e.g., ["age"] for single field or ["lastName", "firstName"] for compound */
  keys: string[];
}

export function indexDefinitionsFromTableSchema(
  tableSchema: TableSchema,
): IndexDefinition[] {
  return Object.entries(tableSchema.indexes).map(([indexName, keys]) => {
    return {
      name: indexName, // Don't prefix here - indexDefinitionToIDBIndex will do it
      table: tableSchema.tableName,
      keys,
    };
  });
}

/**
 * Converts an index definition into the internal IndexedDB index format.
 *
 * This function maps logical index definitions (table + field names) to the physical
 * index structure used in the underlying object store. It generates the internal index
 * name and constructs the key path that navigates through the CRDT document structure.
 *
 * @param index - The index definition to convert
 * @returns A tuple of [indexName, keyPath] for IDBObjectStore.createIndex()
 *
 * @example
 * ```typescript
 * const [name, keyPath] = indexDefinitionToIDBIndex({
 *   name: 'usersByAge',
 *   table: 'users',
 *   keys: ['age']
 * });
 * // Returns: ['users_usersByAge', ['table_name', 'fields.age.value']]
 * ```
 */
export function indexDefinitionToIDBIndex(index: IndexDefinition): [string, string[]] {
  const internalIndexName = createIndexName(index.table, index.name);

  // Build key path: [tableName, field1.value, field2.value, ...]
  const keyPath = [
    TABLE_NAME, // "table_name"
    ...index.keys.map((key) => `fields.${key}.value`),
  ];

  return [internalIndexName, keyPath];
}

/**
 * Creates a deterministic hash of index definitions for change detection.
 *
 * Generates a stable string representation of the index configuration by sorting
 * indexes by name and serializing their properties in alphabetical order. This hash
 * is used to detect when the index schema has changed and needs updating.
 *
 * @param indexes - Array of index definitions to hash
 * @returns A stable hash string representing the index configuration
 *
 * @example
 * ```typescript
 * const hash = hashIndexDefinitions([
 *   { name: 'byAge', table: 'users', keys: ['age'] },
 *   { name: 'byName', table: 'users', keys: ['name'] }
 * ]);
 * // Returns a deterministic hash string
 * ```
 */
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

/**
 * Checks if the database indexes need to be updated.
 *
 * Compares the current index configuration (stored in the database) with the desired
 * configuration. Returns true if they differ, indicating that indexes need to be rebuilt.
 *
 * @param tx - An IndexedDB transaction with access to CLIENT_STATE_STORE
 * @param indexes - The desired index definitions
 * @returns Promise that resolves to true if indexes need updating, false otherwise
 *
 * @throws {Error} If the transaction doesn't include CLIENT_STATE_STORE
 *
 * @example
 * ```typescript
 * const tx = db.transaction([CLIENT_STATE_STORE], 'readonly');
 * const needsUpdate = await needIndexUpdate(tx, [
 *   { name: 'byAge', table: 'users', keys: ['age'] }
 * ]);
 *
 * if (needsUpdate) {
 *   // Trigger index rebuild
 * }
 * ```
 */
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

//  ------------------------------------------------------------------------
//  Helpers/utils
//  ------------------------------------------------------------------------

/**
 * Creates an internal index name by combining table and index names.
 *
 * @param table - The table name
 * @param name - The logical index name
 * @returns The internal index name in format "table_name"
 *
 * @example
 * ```typescript
 * createIndexName('users', 'byAge') // Returns: 'users_byAge'
 * ```
 */
export function createIndexName(table: string, name: string) {
  return `${table}_${name}`;
}

/**
 * Compares two IDBValidKey values for equality, handling Date objects correctly.
 *
 * Unlike strict equality (===), this function compares Date objects by their timestamp
 * value rather than by reference, ensuring that two Date objects with the same time
 * are considered equal.
 *
 * @param a - First key to compare
 * @param b - Second key to compare
 * @returns true if keys are equal, false otherwise
 *
 * @example
 * ```typescript
 * keysEqual(5, 5) // true
 * keysEqual('a', 'a') // true
 * keysEqual(new Date(2024, 0, 1), new Date(2024, 0, 1)) // true
 * keysEqual(new Date(2024, 0, 1), new Date(2024, 0, 2)) // false
 * ```
 *
 * @internal
 */
function keysEqual(a: IDBValidKey, b: IDBValidKey): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return false;
}
