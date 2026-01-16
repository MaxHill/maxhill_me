//  ------------------------------------------------------------------------
//  Types
//  ------------------------------------------------------------------------
// Unique identifier for each operation
export type Dot = {
  clientId: string;
  version: number;
};

export type ValidKey = string | number | symbol;

export type CRDTOperation =
  | {
    type: "set";
    table: string;
    rowKey: ValidKey;
    field: string;
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
    context: Record<string, number>;
  };

export type LWWField = {
  value: any;
  dot: Dot;
};

export type ORMapRow = {
  fields: Record<string, LWWField>;
  tombstone?: {
    dot: Dot;
    context: Record<string, number>; // tracks which dots were observed by this delete
  };
};

// CRDT value for a table (OR-Map)
export type CRDTValue = Record<ValidKey, ORMapRow>;

//  ------------------------------------------------------------------------
//  Methods
//  ------------------------------------------------------------------------
export function compareDots(a: Dot, b: Dot): number {
  if (a.version !== b.version) return a.version - b.version;
  return a.clientId.localeCompare(b.clientId);
}

/**
 * Deterministic comparison of values for tiebreaking when dots are equal.
 * Uses JSON serialization for consistent ordering.
 */
function compareValues(a: any, b: any): number {
  const aStr = JSON.stringify(a);
  const bStr = JSON.stringify(b);
  return aStr.localeCompare(bStr);
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
