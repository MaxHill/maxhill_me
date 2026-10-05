import { assert } from "@maxhill/stdx";

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
    type: "setRow";
    tableName: string;
    rowKey: ValidKey;
    fields: Record<string, any>;
    dot: Dot;
  }
  | {
    type: "removeRow";
    tableName: string;
    rowKey: ValidKey;
    dot: Dot;
    versionVector: Record<string, number>;
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
    versionVector: Record<string, number>;
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

  let result: Record<string, any> = {};
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
  if (a.version !== b.version) return a.version - b.version;
  return a.clientId.localeCompare(b.clientId);
}

export function applyOperationToRow(row: ORMapRow, operation: CRDTOperation): void {
  row = validateRow(row);
  operation = validateOperation(operation);

  if (operation.type === "setRow") {
    // Check if tombstone dominates
    if (row.tombstone) {
      const seenVersion = row.tombstone.versionVector[operation.dot.clientId];
      if (seenVersion !== undefined && operation.dot.version <= seenVersion) {
        return; // Tombstone wins
      }
    }

    for (const [field, value] of Object.entries(operation.fields)) {
      const existing = row.fields[field];

      if (!existing) {
        // No existing value, just set it
        row.fields[field] = { value, dot: operation.dot };
      } else {
        const cmp = compareDots(operation.dot, existing.dot);
        if (cmp > 0) {
          // New dot is higher, replace
          row.fields[field] = { value, dot: operation.dot };
        } else {
          assert(cmp !== 0, `CRDT invariant violated: duplicate dot for field "${field}"`);
        }
        // Otherwise keep existing (cmp < 0)
      }
    }
  } else if (operation.type === "removeRow") {
    // Merge with existing tombstone if present
    let finalTombstone: { dot: Dot; versionVector: Record<string, number> };

    if (row.tombstone) {
      // Use LWW for tombstone dots, and merge version vectors.
      const cmp = compareDots(operation.dot, row.tombstone.dot);
      const winningDot = cmp > 0 ? operation.dot : row.tombstone.dot;

      // When merging two tombstones (concurrent deletes), we need to merge their version vectors.
      // The merged version vector tracks the maximum version seen from each client across both deletes.
      // This ensures the resulting tombstone dominates all writes that EITHER delete observed.
      // Example: Delete A saw client1:v5, Delete B saw client1:v7 → merged sees client1:v7
      const mergedVersionVector: Record<string, number> = { ...row.tombstone.versionVector };
      for (const [clientId, version] of Object.entries(operation.versionVector)) {
        const existing = mergedVersionVector[clientId];
        mergedVersionVector[clientId] = existing !== undefined ? Math.max(existing, version) : version;
      }

      finalTombstone = { dot: winningDot, versionVector: mergedVersionVector };
    } else {
      finalTombstone = { dot: operation.dot, versionVector: operation.versionVector };
    }

    // Keep only fields NOT dominated by the final tombstone
    const newFields: Record<string, LWWField> = {};
    for (const [field, fieldState] of Object.entries(row.fields)) {
      const seenCounter = finalTombstone.versionVector[fieldState.dot.clientId];
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
  assert(row, "Row must be defined");
  assert(row.fields, "Row.fields must be defined");

  return row;
}

export function validateOperation(operation: CRDTOperation): CRDTOperation {
  assert(operation, "Operation must be defined");
  assert(operation.dot, "Operation.dot must be defined");
  assert(
    typeof operation.dot.version === "number",
    `Invalid dot version: ${operation.dot.version}`,
  );
  assert(operation.dot.version >= 0, `Invalid dot version: ${operation.dot.version}`);
  assert(operation.dot.clientId, "Operation.dot.clientId must be defined");
  if (operation.type === "setRow") {
    assert(
      typeof operation.fields === "object" && operation.fields !== null && !Array.isArray(operation.fields),
      `SetRow operation fields must be a plain object: ${typeof operation.fields}`,
    );
    for (const [fieldKey, value] of Object.entries(operation.fields)) {
      assert(fieldKey !== "_key", "SetRow operation cannot set reserved _key field");
      assert(
        isSerializable(value),
        `SetRow operation has non-serializable field "${fieldKey}": ${typeof value}`,
      );
    }
  }

  if (operation.type === "removeRow") {
    for (const [clientId, version] of Object.entries(operation.versionVector)) {
      assert(version >= 0, `Invalid versionVector version for ${clientId}: ${version}`);
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
