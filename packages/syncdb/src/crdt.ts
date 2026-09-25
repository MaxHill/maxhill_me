//  ------------------------------------------------------------------------
//  Types
//  ------------------------------------------------------------------------
// Unique identifier for each operation
export type Dot = {
  clientId: string;
  version: number;
};

export type ValidKey = string;

export type CRDTOperation =
  | {
    type: "set";
    table: string;
    rowKey: string;
    field?: string;
    value: any;
    dot: Dot;
  }
  | {
    type: "setRow";
    table: string;
    rowKey: ValidKey;
    value: Record<string, any>;
    dot: Dot;
  }
  | {
    type: "remove";
    table: string;
    rowKey: ValidKey;
    dot: Dot;
    context: Record<string, number>; // Always present (empty object for non-remove operations)
  };

export type LWWField = {
  value: any;
  dot: Dot;
};

export const TABLE_NAME = "table_name";
export const ROW_KEY = "row_key";
export type ORMapRow = {
  [TABLE_NAME]: string;
  [ROW_KEY]: ValidKey;
  fields: Record<string, LWWField>;
  tombstone?: {
    dot: Dot;
    context: Record<string, number>; // tracks which dots were observed by this delete
  };
};

/**
 * Converts an internal row to a user
 * facing row by constructing a
 * object of the fields stored
 * in the CRDT.
 */
export function toUserRow(row: ORMapRow) {
  // Skip rows with no fields (deleted rows)
  if (Object.keys(row.fields).length === 0) {
    return undefined;
  }

  const result: Record<string, any> = {};
  for (const [field, fieldState] of Object.entries(row.fields)) {
    result[field] = fieldState.value;
  }

  return Object.assign({ _key: row[ROW_KEY] }, result);
}

// CRDT value for a table (OR-Map)
export type CRDTValue = Record<ValidKey, ORMapRow>;

//  ------------------------------------------------------------------------
//  Methods
//  ------------------------------------------------------------------------
export function compareDots(a: Dot, b: Dot): number {
  if (a.version !== b.version) {
    return a.version - b.version;
  }
  return compareUtf8Bytes(a.clientId, b.clientId);
}

/**
 * Deterministic comparison of JSON values for tiebreaking when dots are equal.
 *
 * Keep this in sync with apps/syncdb-compaction/src/crdt.zig:
 * null < bool < integer < float < number_string < string < array < object.
 * TypeScript has no separate representation for Zig's `number_string`, so that
 * rank is reserved and normal JavaScript strings compare at the `string` rank.
 */
export function compareValues(a: any, b: any): number {
  const typeOrder = compareValueType(a, b);
  if (typeOrder !== 0) {
    return typeOrder;
  }

  switch (valueTypeRank(a)) {
    case 0:
      return 0;
    case 1:
      return Number(a) - Number(b);
    case 2:
    case 3:
      return compareNumbers(a, b);
    case 5:
      return compareUtf8Bytes(a, b);
    case 6:
      return compareArrays(a, b);
    case 7:
      return compareObjects(a, b);
    default:
      throw new Error(`Unsupported CRDT value type rank: ${valueTypeRank(a)}`);
  }
}

function compareValueType(a: any, b: any): number {
  return valueTypeRank(a) - valueTypeRank(b);
}

function valueTypeRank(value: any): number {
  if (value === null) {
    return 0;
  }
  if (typeof value === "boolean") {
    return 1;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid CRDT number value: ${value}`);
    }
    return Number.isInteger(value) ? 2 : 3;
  }
  if (typeof value === "string") {
    return 5;
  }
  if (Array.isArray(value)) {
    return 6;
  }
  if (isPlainObject(value)) {
    return 7;
  }

  throw new Error(`Unsupported CRDT value type: ${typeof value}`);
}

function compareNumbers(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

const utf8Encoder = new TextEncoder();

function compareUtf8Bytes(a: string, b: string): number {
  const aBytes = utf8Encoder.encode(a);
  const bBytes = utf8Encoder.encode(b);
  const n = Math.min(aBytes.length, bBytes.length);

  for (let i = 0; i < n; i++) {
    const aByte = aBytes[i];
    const bByte = bBytes[i];
    if (aByte === undefined || bByte === undefined) {
      throw new Error("UTF-8 encoder produced sparse output");
    }
    if (aByte < bByte) {
      return -1;
    }
    if (aByte > bByte) {
      return 1;
    }
  }

  return aBytes.length - bBytes.length;
}

function compareArrays(a: any[], b: any[]): number {
  const n = Math.min(a.length, b.length);

  for (let i = 0; i < n; i++) {
    const order = compareValues(a[i], b[i]);
    if (order !== 0) {
      return order;
    }
  }

  return a.length - b.length;
}

function compareObjects(a: Record<string, any>, b: Record<string, any>): number {
  const aKeys = Object.keys(a).sort(compareUtf8Bytes);
  const bKeys = Object.keys(b).sort(compareUtf8Bytes);
  const n = Math.min(aKeys.length, bKeys.length);

  for (let i = 0; i < n; i++) {
    const aKey = aKeys[i];
    const bKey = bKeys[i];
    if (aKey === undefined || bKey === undefined) {
      throw new Error("Object.keys produced sparse output");
    }

    const keyOrder = compareUtf8Bytes(aKey, bKey);
    if (keyOrder !== 0) {
      return keyOrder;
    }

    const valueOrder = compareValues(a[aKey], b[bKey]);
    if (valueOrder !== 0) {
      return valueOrder;
    }
  }

  return aKeys.length - bKeys.length;
}

function isPlainObject(value: any): value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function applyOperationToRow(row: ORMapRow, operation: CRDTOperation): void {
  row = validateRow(row);
  operation = validateOperation(operation);

  if (operation.type === "set") {
    // Check if this set operation is dominated by an existing tombstone.
    // Tombstones track a "context" - a map of clientId → highest version seen at delete time.
    // If this set's dot.version is <= the context version for its client, the delete happened
    // after this write from the deleter's perspective, so we ignore the set (delete wins).
    // This prevents "resurrection" of deleted fields by late-arriving concurrent writes.
    if (row.tombstone) {
      const seen = row.tombstone.context[operation.dot.clientId];
      if (seen !== undefined && operation.dot.version <= seen) {
        return; // Tombstone wins
      }
    }

    // This casting is safe since this is already validated in validateOperation()
    const field = operation.field as string;
    const existing = row.fields[field];

    if (!existing) {
      // No existing value, just set it
      row.fields[field] = { value: operation.value, dot: operation.dot };
    } else {
      const cmp = compareDots(operation.dot, existing.dot);
      if (cmp > 0) {
        // New dot is higher, replace
        row.fields[field] = { value: operation.value, dot: operation.dot };
      } else if (cmp === 0 && compareValues(operation.value, existing.value) > 0) {
        // Dots are equal, use value tiebreaker for deterministic convergence
        row.fields[field] = { value: operation.value, dot: operation.dot };
      }
      // Otherwise keep existing (cmp < 0 or cmp === 0 with lower value)
    }
  } else if (operation.type === "setRow") {
    // Check if tombstone dominates
    if (row.tombstone) {
      const seen = row.tombstone.context[operation.dot.clientId];
      if (seen !== undefined && operation.dot.version <= seen) {
        return; // Tombstone wins
      }
    }

    for (const [field, value] of Object.entries(operation.value)) {
      const existing = row.fields[field];

      if (!existing) {
        // No existing value, just set it
        row.fields[field] = { value, dot: operation.dot };
      } else {
        const cmp = compareDots(operation.dot, existing.dot);
        if (cmp > 0) {
          // New dot is higher, replace
          row.fields[field] = { value, dot: operation.dot };
        } else if (cmp === 0 && compareValues(value, existing.value) > 0) {
          // Dots are equal, use value tiebreaker for deterministic convergence
          row.fields[field] = { value, dot: operation.dot };
        }
        // Otherwise keep existing (cmp < 0 or cmp === 0 with lower value)
      }
    }
  } else if (operation.type === "remove") {
    // Merge with existing tombstone if present
    let finalTombstone: { dot: Dot; context: Record<string, number> };

    if (row.tombstone) {
      // Use LWW for tombstone dots, and merge contexts
      const cmp = compareDots(operation.dot, row.tombstone.dot);
      const winningDot = cmp > 0 ? operation.dot : row.tombstone.dot;

      // When merging two tombstones (concurrent deletes), we need to merge their contexts.
      // The merged context tracks the maximum version seen from each client across both deletes.
      // This ensures the resulting tombstone dominates all writes that EITHER delete observed.
      // Example: Delete A saw client1:v5, Delete B saw client1:v7 → merged sees client1:v7
      const mergedContext: Record<string, number> = { ...row.tombstone.context };
      for (const [clientId, version] of Object.entries(operation.context)) {
        const existing = mergedContext[clientId];
        mergedContext[clientId] = existing !== undefined ? Math.max(existing, version) : version;
      }

      finalTombstone = { dot: winningDot, context: mergedContext };
    } else {
      finalTombstone = { dot: operation.dot, context: operation.context };
    }

    // Keep only fields NOT dominated by the final tombstone
    const newFields: Record<string, LWWField> = {};
    for (const [field, fieldState] of Object.entries(row.fields)) {
      const seenCounter = finalTombstone.context[fieldState.dot.clientId];
      if (seenCounter === undefined || fieldState.dot.version > seenCounter) {
        newFields[field] = fieldState;
      }
    }

    row.fields = newFields;
    row.tombstone = finalTombstone;
  }
}

//  ------------------------------------------------------------------------
//  Validation
//  ------------------------------------------------------------------------
export function validateRow(row: ORMapRow) {
  if (!row) {
    throw new Error("Row must be defined");
  }
  if (!row.fields) {
    throw new Error("Row.fields must be defined");
  }

  return row;
}

export function validateOperation(operation: CRDTOperation): CRDTOperation {
  if (!operation) {
    throw new Error("Operation must be defined");
  }
  if (!operation.dot) {
    throw new Error("Operation.dot must be defined");
  }
  if (typeof operation.dot.version !== "number" || operation.dot.version < 0) {
    throw new Error(`Invalid dot version: ${operation.dot.version}`);
  }
  if (!operation.dot.clientId) {
    throw new Error("Operation.dot.clientId must be defined");
  }
  if (operation.type === "set") {
    if (!operation.field) {
      throw new Error("Set operation is missing field");
    }
    if (!isSerializable(operation.value)) {
      throw new Error(`Set operation has non-serializable value: ${typeof operation.value}`);
    }
  }

  if (operation.type === "remove") {
    for (const [clientId, version] of Object.entries(operation.context)) {
      if (version < 0) {
        throw new Error(`Invalid context version for ${clientId}: ${version}`);
      }
    }
  }

  return operation;
}

export function isSerializable(value: any): boolean {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return false;
  }
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false; // Circular reference
  }
}
