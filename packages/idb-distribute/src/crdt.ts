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

export function applyOpToRow(row: ORMapRow, op: CRDTOperation): void {
  if (op.type === "set") {
    // Check if tombstone dominates
    if (row.tombstone) {
      const seen = row.tombstone.context[op.dot.clientId];
      if (seen !== undefined && op.dot.version <= seen) {
        return; // Tombstone wins
      }
    }

    const field = op.field;
    if (!field) {
      throw new Error("Set operation is missing field");
    }
    const existing = row.fields[field];

    if (!existing) {
      // No existing value, just set it
      row.fields[field] = { value: op.value, dot: op.dot };
    } else {
      const cmp = compareDots(op.dot, existing.dot);
      if (cmp > 0) {
        // New dot is higher, replace
        row.fields[field] = { value: op.value, dot: op.dot };
      } else if (cmp === 0 && compareValues(op.value, existing.value) > 0) {
        // Dots are equal, use value tiebreaker for deterministic convergence
        row.fields[field] = { value: op.value, dot: op.dot };
      }
      // Otherwise keep existing (cmp < 0 or cmp === 0 with lower value)
    }
  } else if (op.type === "setRow") {
    // Check if tombstone dominates
    if (row.tombstone) {
      const seen = row.tombstone.context[op.dot.clientId];
      if (seen !== undefined && op.dot.version <= seen) {
        return; // Tombstone wins
      }
    }

    for (const [field, value] of Object.entries(op.value)) {
      const existing = row.fields[field];

      if (!existing) {
        // No existing value, just set it
        row.fields[field] = { value, dot: op.dot };
      } else {
        const cmp = compareDots(op.dot, existing.dot);
        if (cmp > 0) {
          // New dot is higher, replace
          row.fields[field] = { value, dot: op.dot };
        } else if (cmp === 0 && compareValues(value, existing.value) > 0) {
          // Dots are equal, use value tiebreaker for deterministic convergence
          row.fields[field] = { value, dot: op.dot };
        }
        // Otherwise keep existing (cmp < 0 or cmp === 0 with lower value)
      }
    }
  } else if (op.type === "remove") {
    // Merge with existing tombstone if present
    let finalTombstone: { dot: Dot; context: Record<string, number> };

    if (row.tombstone) {
      // Use LWW for tombstone dots, and merge contexts
      const cmp = compareDots(op.dot, row.tombstone.dot);
      const winningDot = cmp > 0 ? op.dot : row.tombstone.dot;

      // Merge contexts: take max version for each client
      const mergedContext: Record<string, number> = { ...row.tombstone.context };
      for (const [clientId, version] of Object.entries(op.context)) {
        const existing = mergedContext[clientId];
        mergedContext[clientId] = existing !== undefined ? Math.max(existing, version) : version;
      }

      finalTombstone = { dot: winningDot, context: mergedContext };
    } else {
      finalTombstone = { dot: op.dot, context: op.context };
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
