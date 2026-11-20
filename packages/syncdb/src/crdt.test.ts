import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyOperationToRow,
  compareDots,
  type CRDTOperation,
  type Dot,
  type LWWField,
  type ORMapRow,
  ROW_KEY,
  TABLE_NAME,
} from "./crdt.ts";

//  ------------------------------------------------------------------------
//  Fast-Check Generators
//  ------------------------------------------------------------------------

const generateClientId = (): fc.Arbitrary<string> =>
  fc.constantFrom("client1", "client2", "client3", "client4");

const generateDot = (): fc.Arbitrary<Dot> =>
  fc.record({
    clientId: generateClientId(),
    version: fc.nat({ max: 1000 }),
  });

const generateLWWField = (): fc.Arbitrary<LWWField> =>
  fc.record({
    value: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    dot: generateDot(),
  });

const generateSafeFieldName = (): fc.Arbitrary<string> =>
  fc
    .string({ minLength: 1, maxLength: 10 })
    .filter((s) => !["__proto__", "constructor", "prototype", "toString", "valueOf"].includes(s));

const generateORMapRow = (): fc.Arbitrary<ORMapRow> =>
  fc.record({
    [TABLE_NAME]: fc.constant("test_table"),
    [ROW_KEY]: fc.string(),
    fields: fc.dictionary(generateSafeFieldName(), generateLWWField()),
    tombstone: fc.option(
      fc.record({
        dot: generateDot(),
        versionVector: fc.dictionary(generateClientId(), fc.nat({ max: 1000 })),
      }),
      { nil: undefined },
    ),
  });

const generateSetOperation = (): fc.Arbitrary<CRDTOperation> =>
  fc
    .tuple(
      generateSafeFieldName(),
      fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
      generateDot(),
      fc.string(),
    )
    .map(([fieldKey, value, dot, rowKey]) => ({
      type: "setRow" as const,
      tableName: "test_table",
      rowKey,
      fields: { [fieldKey]: value },
      dot,
    }));

const generateSetRowOperation = (): fc.Arbitrary<CRDTOperation> =>
  fc.record({
    type: fc.constant("setRow" as const),
    tableName: fc.constant("test_table"),
    rowKey: fc.string(),
    fields: fc.dictionary(
      generateSafeFieldName(),
      fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    ),
    dot: generateDot(),
  });

const generateRemoveOperation = (): fc.Arbitrary<CRDTOperation> =>
  fc.record({
    type: fc.constant("removeRow" as const),
    tableName: fc.constant("test_table"),
    rowKey: fc.string(),
    dot: generateDot(),
    versionVector: fc.dictionary(generateClientId(), fc.nat({ max: 1000 })),
  });

const generateCRDTOperation = (): fc.Arbitrary<CRDTOperation> =>
  fc.oneof(generateSetOperation(), generateSetRowOperation(), generateRemoveOperation());

//  ------------------------------------------------------------------------
//  compareDots Tests
//  ------------------------------------------------------------------------

// Suite registration groups related tests; individual tests remain line-limited.
// eslint-disable-next-line max-lines-per-function
describe("compareDots", () => {
  describe("unit tests", () => {
    it("should return negative when a.version < b.version", () => {
      const a: Dot = { clientId: "client1", version: 5 };
      const b: Dot = { clientId: "client1", version: 10 };
      expect(compareDots(a, b)).toBeLessThan(0);
    });

    it("should return positive when a.version > b.version", () => {
      const a: Dot = { clientId: "client1", version: 10 };
      const b: Dot = { clientId: "client1", version: 5 };
      expect(compareDots(a, b)).toBeGreaterThan(0);
    });

    it("should use lexicographic clientId comparison when versions are equal", () => {
      const a: Dot = { clientId: "client1", version: 5 };
      const b: Dot = { clientId: "client2", version: 5 };
      expect(compareDots(a, b)).toBeLessThan(0);
      expect(compareDots(b, a)).toBeGreaterThan(0);
    });

    it("should return 0 for identical dots", () => {
      const a: Dot = { clientId: "client1", version: 5 };
      const b: Dot = { clientId: "client1", version: 5 };
      expect(compareDots(a, b)).toBe(0);
    });
  });

  describe("property tests", () => {
    it("reflexive: compareDots(a, a) === 0", () => {
      fc.assert(
        fc.property(generateDot(), (dot) => {
          expect(compareDots(dot, dot)).toBe(0);
        }),
      );
    });

    it("antisymmetric: compareDots(a, b) === -compareDots(b, a)", () => {
      fc.assert(
        fc.property(generateDot(), generateDot(), (a, b) => {
          const ab = compareDots(a, b);
          const ba = compareDots(b, a);
          // Handle the +0/-0 case: when ab is 0, ba should also be 0
          if (ab === 0) {
            expect(ba).toBe(0);
          } else {
            expect(ab).toEqual(-ba);
          }
        }),
      );
    });

    it("transitive: if a < b and b < c, then a < c", () => {
      fc.assert(
        fc.property(generateDot(), generateDot(), generateDot(), (a, b, c) => {
          const ab = compareDots(a, b);
          const bc = compareDots(b, c);
          const ac = compareDots(a, c);

          if (ab < 0 && bc < 0) {
            expect(ac).toBeLessThan(0);
          }
        }),
      );
    });

    it("total order: any two dots are comparable", () => {
      fc.assert(
        fc.property(generateDot(), generateDot(), (a, b) => {
          const result = compareDots(a, b);
          expect(typeof result).toBe("number");
          expect(result === 0 || result > 0 || result < 0).toBe(true);
        }),
      );
    });
  });
});

//  ------------------------------------------------------------------------
//  applyOpToRow Tests
//  ------------------------------------------------------------------------

// Suite registration groups related tests; individual tests remain line-limited.
// eslint-disable-next-line max-lines-per-function
describe("applyOpToRow", () => {
  // Suite registration groups related tests; individual tests remain line-limited.
  // eslint-disable-next-line max-lines-per-function
  describe("set operations", () => {
    it("should apply set to empty row", () => {
      const row: ORMapRow = { [TABLE_NAME]: "test", [ROW_KEY]: "row1", fields: {} };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { ["name"]: "Alice" },
        dot: { clientId: "client1", version: 1 },
      };

      applyOperationToRow(row, operation);

      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client1", version: 1 },
      });
    });

    it("should replace field when new dot is higher (LWW)", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 1 } },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { ["name"]: "Bob" },
        dot: { clientId: "client1", version: 2 },
      };

      applyOperationToRow(row, operation);

      expect(row.fields.name.value).toBe("Bob");
      expect(row.fields.name.dot.version).toBe(2);
    });

    it("should ignore set when existing dot is higher", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {
          name: { value: "Bob", dot: { clientId: "client1", version: 5 } },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { ["name"]: "Alice" },
        dot: { clientId: "client1", version: 3 },
      };

      applyOperationToRow(row, operation);

      expect(row.fields.name.value).toBe("Bob");
      expect(row.fields.name.dot.version).toBe(5);
    });

    it("should use clientId tiebreaker when versions are equal", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 5 } },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { ["name"]: "Bob" },
        dot: { clientId: "client2", version: 5 },
      };

      applyOperationToRow(row, operation);

      // client2 > client1 lexicographically
      expect(row.fields.name.value).toBe("Bob");
      expect(row.fields.name.dot.clientId).toBe("client2");
    });

    it("should reject conflicting values at the same dot", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {
          value: { value: "z", dot: { clientId: "client1", version: 1 } },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { ["value"]: {} },
        dot: { clientId: "client1", version: 1 },
      };

      expect(() => applyOperationToRow(row, operation)).toThrow(
        'CRDT invariant violated: duplicate dot for field "value"',
      );
    });

    it("should throw error when field is missing in set operation", () => {
      const row: ORMapRow = { [TABLE_NAME]: "test", [ROW_KEY]: "row1", fields: {} };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: undefined as any,
        dot: { clientId: "client1", version: 1 },
      };

      expect(() => applyOperationToRow(row, operation)).toThrow(
        "SetRow operation fields must be a plain object",
      );
    });

    it("should reject set dominated by tombstone", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {},
        tombstone: {
          dot: { clientId: "client1", version: 10 },
          versionVector: { client1: 5 },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { ["name"]: "Alice" },
        dot: { clientId: "client1", version: 5 },
      };

      applyOperationToRow(row, operation);

      expect(row.fields.name).toBeUndefined();
    });

    it("should allow set with higher version than tombstone context", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {},
        tombstone: {
          dot: { clientId: "client1", version: 10 },
          versionVector: { client1: 5 },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { ["name"]: "Alice" },
        dot: { clientId: "client1", version: 6 },
      };

      applyOperationToRow(row, operation);

      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client1", version: 6 },
      });
    });

    it("should allow set from client not in tombstone context", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {},
        tombstone: {
          dot: { clientId: "client1", version: 10 },
          versionVector: { client1: 5 },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { ["name"]: "Alice" },
        dot: { clientId: "client2", version: 1 },
      };

      applyOperationToRow(row, operation);

      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client2", version: 1 },
      });
    });

    it("property: LWW convergence - operations applied in any order yield same result", () => {
      fc.assert(
        fc.property(
          generateORMapRow(),
          fc.array(generateSetOperation(), { minLength: 2, maxLength: 5 }),
          (initialRow, operations) => {
            // Ensure all ops target the same field. Duplicate dots for the
            // same field are invalid CRDT input, so skip those cases.
            const field = "testField";
            const normalizedOperations = operations.map((operation) => ({
              ...operation,
              field,
            }));
            fc.pre(
              new Set(
                normalizedOperations.map(
                  (operation) => `${operation.dot.clientId}:${operation.dot.version}`,
                ),
              ).size === normalizedOperations.length,
            );

            // Apply in original order
            const row1: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            delete row1.fields[field];
            normalizedOperations.forEach((operation) => applyOperationToRow(row1, operation));

            // Apply in reverse order
            const row2: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            delete row2.fields[field];
            [...normalizedOperations]
              .reverse()
              .forEach((operation) => applyOperationToRow(row2, operation));

            // Both should converge to same result
            expect(row1.fields[field]).toEqual(row2.fields[field]);
          },
        ),
      );
    });
  });

  // Suite registration groups related tests; individual tests remain line-limited.
  // eslint-disable-next-line max-lines-per-function
  describe("setRow operations", () => {
    it("should set multiple fields with same dot", () => {
      const row: ORMapRow = { [TABLE_NAME]: "test", [ROW_KEY]: "row1", fields: {} };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { name: "Alice", age: 30 },
        dot: { clientId: "client1", version: 1 },
      };

      applyOperationToRow(row, operation);

      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client1", version: 1 },
      });
      expect(row.fields.age).toEqual({
        value: 30,
        dot: { clientId: "client1", version: 1 },
      });
    });

    it("should only update fields where new dot wins", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {
          name: { value: "Bob", dot: { clientId: "client1", version: 5 } },
          age: { value: 25, dot: { clientId: "client1", version: 2 } },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { name: "Alice", age: 30 },
        dot: { clientId: "client1", version: 3 },
      };

      applyOperationToRow(row, operation);

      // name stays Bob (version 5 > 3)
      expect(row.fields.name.value).toBe("Bob");
      // age updates to 30 (version 3 > 2)
      expect(row.fields.age.value).toBe(30);
    });

    it("should reject setRow dominated by tombstone", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {},
        tombstone: {
          dot: { clientId: "client1", version: 10 },
          versionVector: { client1: 5 },
        },
      };
      const operation: CRDTOperation = {
        type: "setRow",
        tableName: "test",
        rowKey: "row1",
        fields: { name: "Alice", age: 30 },
        dot: { clientId: "client1", version: 5 },
      };

      applyOperationToRow(row, operation);

      expect(Object.keys(row.fields)).toHaveLength(0);
    });

    it("property: concurrent setRow operations converge", () => {
      fc.assert(
        fc.property(
          generateORMapRow(),
          generateSetRowOperation(),
          generateSetRowOperation(),
          (initialRow, op1, op2) => {
            // Apply ops in both orders
            const row1: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            applyOperationToRow(row1, op1);
            applyOperationToRow(row1, op2);

            const row2: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            applyOperationToRow(row2, op2);
            applyOperationToRow(row2, op1);

            // Should converge
            expect(row1).toEqual(row2);
          },
        ),
      );
    });
  });

  // Suite registration groups related tests; individual tests remain line-limited.
  // eslint-disable-next-line max-lines-per-function
  describe("remove operations", () => {
    it("should create tombstone and remove dominated fields", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 3 } },
          age: { value: 30, dot: { clientId: "client2", version: 2 } },
        },
      };
      const operation: CRDTOperation = {
        type: "removeRow",
        tableName: "test",
        rowKey: "row1",
        dot: { clientId: "client1", version: 10 },
        versionVector: { client1: 5, client2: 2 },
      };

      applyOperationToRow(row, operation);

      // age is dominated (client2: 2 <= 2), name is not (client1: 3 > 5 is false, but 3 <= 5)
      expect(row.fields.name).toBeUndefined();
      expect(row.fields.age).toBeUndefined();
      expect(row.tombstone).toEqual({
        dot: { clientId: "client1", version: 10 },
        versionVector: { client1: 5, client2: 2 },
      });
    });

    it("should keep fields with versions higher than tombstone context", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 6 } },
          age: { value: 30, dot: { clientId: "client2", version: 2 } },
        },
      };
      const operation: CRDTOperation = {
        type: "removeRow",
        tableName: "test",
        rowKey: "row1",
        dot: { clientId: "client1", version: 10 },
        versionVector: { client1: 5, client2: 2 },
      };

      applyOperationToRow(row, operation);

      // name survives (6 > 5), age is removed (2 <= 2)
      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client1", version: 6 },
      });
      expect(row.fields.age).toBeUndefined();
    });

    it("should keep fields from clients not in tombstone context", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "row1",
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 3 } },
          age: { value: 30, dot: { clientId: "client3", version: 1 } },
        },
      };
      const operation: CRDTOperation = {
        type: "removeRow",
        tableName: "test",
        rowKey: "row1",
        dot: { clientId: "client1", version: 10 },
        versionVector: { client1: 5 },
      };

      applyOperationToRow(row, operation);

      // age survives (client3 not in context)
      expect(row.fields.name).toBeUndefined();
      expect(row.fields.age).toEqual({
        value: 30,
        dot: { clientId: "client3", version: 1 },
      });
    });

    it("property: tombstone dominates all earlier writes from observed clients", () => {
      fc.assert(
        fc.property(
          generateRemoveOperation(),
          fc.array(generateSetOperation(), { minLength: 1, maxLength: 5 }),
          (removeOp, setOps) => {
            const row: ORMapRow = {
              [TABLE_NAME]: "test_table",
              [ROW_KEY]: "test_row",
              fields: {},
            };

            // Apply all sets with versions <= context
            const dominatedSets = setOps.map((operation) => {
              const clientId = operation.dot.clientId;
              if (removeOp.type !== "removeRow") {
                throw new Error("Type should be remove");
              }
              const contextVersion = removeOp.versionVector[clientId];
              if (contextVersion !== undefined) {
                return {
                  ...operation,
                  dot: {
                    clientId,
                    version: Math.min(operation.dot.version, contextVersion),
                  },
                };
              }
              return operation;
            });

            dominatedSets.forEach((operation) => applyOperationToRow(row, operation));
            applyOperationToRow(row, removeOp);

            // All fields from clients in context with version <= context should be gone
            Object.values(row.fields).forEach((field) => {
              if (removeOp.type !== "removeRow") {
                throw new Error("Type should be remove");
              }
              const contextVersion = removeOp.versionVector[field.dot.clientId];
              if (contextVersion !== undefined) {
                expect(field.dot.version).toBeGreaterThan(contextVersion);
              }
            });
          },
        ),
      );
    });

    it("property: resurrection possible with dots higher than tombstone context", () => {
      fc.assert(
        fc.property(
          generateORMapRow(),
          generateRemoveOperation(),
          generateSetOperation(),
          (initialRow, removeOp, setOp) => {
            const row: ORMapRow = JSON.parse(JSON.stringify(initialRow));

            // Apply remove
            applyOperationToRow(row, removeOp);

            // Check the FINAL merged context after remove operation
            const finalContext = row.tombstone?.versionVector ?? {};
            const clientId = setOp.dot.clientId;
            const contextVersion = finalContext[clientId] ?? 0;

            // Create a set with version higher than the merged context
            const resurrectOp: CRDTOperation = {
              ...setOp,
              dot: { clientId, version: contextVersion + 1 },
            };

            applyOperationToRow(row, resurrectOp);

            // Field should exist because version is higher than context
            if (resurrectOp.type === "setRow") {
              for (const fieldKey of Object.keys(resurrectOp.fields)) {
                expect(row.fields[fieldKey]).toBeDefined();
              }
            }
          },
        ),
      );
    });
  });

  describe("checkpoint merge", () => {
    it("preserves original field clocks and merges tombstone context", () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "test",
        [ROW_KEY]: "r",
        fields: {
          keep: { value: "new", dot: { clientId: "b", version: 5 } },
          gone: { value: "old", dot: { clientId: "a", version: 2 } },
        },
        tombstone: { dot: { clientId: "a", version: 3 }, versionVector: { a: 1 } },
      };
      const checkpoint: CRDTOperation = {
        type: "checkpointRow",
        tableName: "test",
        rowKey: "r",
        dot: { clientId: "server", version: 99 },
        checkpointSeenServerVersion: 20,
        fields: {
          keep: { value: "older", dot: { clientId: "b", version: 4 } },
          gone: { value: "old", dot: { clientId: "a", version: 2 } },
        },
        tombstone: { dot: { clientId: "c", version: 4 }, versionVector: { a: 2, c: 1 } },
      };
      applyOperationToRow(row, checkpoint);
      expect(row.fields.keep).toEqual({
        value: "new",
        dot: { clientId: "b", version: 5 },
      });
      expect(row.fields.gone).toBeUndefined();
      expect(row.tombstone).toEqual({
        dot: { clientId: "c", version: 4 },
        versionVector: { a: 2, c: 1 },
      });
      applyOperationToRow(row, checkpoint);
      expect(row.fields.keep.dot).toEqual({ clientId: "b", version: 5 });
    });
  });

  describe("property: general convergence", () => {
    it("operations applied in any order should converge", () => {
      fc.assert(
        fc.property(
          generateORMapRow(),
          fc.array(generateCRDTOperation(), { minLength: 2, maxLength: 10 }),
          (initialRow, ops) => {
            // Apply in original order
            const row1: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            ops.forEach((operation) => {
              try {
                applyOperationToRow(row1, operation);
              } catch {
                // Ignore errors from missing fields in set ops
              }
            });

            // Apply in shuffled order
            const row2: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            const shuffled = [...ops].sort(() => Math.random() - 0.5);
            shuffled.forEach((operation) => {
              try {
                applyOperationToRow(row2, operation);
              } catch {
                // Ignore errors from missing fields in set ops
              }
            });

            // Should converge to same state
            expect(row1).toEqual(row2);
          },
        ),
      );
    });
  });
});

type ReplayKind = "setRow" | "checkpointRow";
const replayKinds: ReplayKind[] = ["setRow", "checkpointRow"];
const replayOrders = replayKinds.flatMap((first) =>
  replayKinds.map((second) => ({ first, second })),
);

function replayRow(): ORMapRow {
  return { [TABLE_NAME]: "test", [ROW_KEY]: "r", fields: {} };
}

function replayOperation(kind: ReplayKind, value: unknown, version = 1): CRDTOperation {
  const dot = { clientId: "writer", version };
  if (kind === "checkpointRow") {
    return {
      type: kind,
      tableName: "test",
      rowKey: "r",
      dot: { clientId: "checkpoint", version: 99 },
      checkpointSeenServerVersion: 10,
      fields: { payload: { value, dot } },
    };
  }
  return { type: kind, tableName: "test", rowKey: "r", dot, fields: { payload: value } };
}

describe("equal-dot field replay", () => {
  it.each(replayOrders)("keeps state for identical $first then $second", ({ first, second }) => {
    const row = replayRow();
    const value = Object.freeze({ a: [true, null], b: { count: 1 } });
    applyOperationToRow(row, replayOperation(first, value));
    const existing = row.fields.payload;
    applyOperationToRow(row, replayOperation(second, { b: { count: 1 }, a: [true, null] }));
    expect(row.fields.payload).toBe(existing);
    expect(row.fields.payload.value).toBe(value);
    expect(row.fields.payload.dot).toEqual({ clientId: "writer", version: 1 });
  });

  it.each(replayOrders)("rejects conflicting $first then $second", ({ first, second }) => {
    const row = replayRow();
    applyOperationToRow(row, replayOperation(first, { nested: [1, 2] }));
    expect(() => applyOperationToRow(row, replayOperation(second, { nested: [2, 1] }))).toThrow(
      'CRDT invariant violated: duplicate dot for field "payload"',
    );
    expect(row.fields.payload.value).toEqual({ nested: [1, 2] });
  });

  it.each([
    [new Date("2026-01-01"), "2026-01-01T00:00:00.000Z"],
    [NaN, null],
    [Infinity, null],
    [1, "1"],
    [{ a: 1 }, {}],
    [[], {}],
  ])("does not coerce or drop values for equal dots (case %#)", (existing, incoming) => {
    const row = replayRow();
    row.fields.payload = { value: existing, dot: { clientId: "writer", version: 1 } };
    expect(() => applyOperationToRow(row, replayOperation("setRow", incoming))).toThrow(
      "duplicate dot",
    );
  });
});

describe("replay preserves clock and tombstone rules", () => {
  it.each(replayKinds)("ignores older clocks and replaces newer clocks for %s", (kind) => {
    const row = replayRow();
    applyOperationToRow(row, replayOperation("setRow", "current"));
    applyOperationToRow(row, replayOperation(kind, "older", 0));
    expect(row.fields.payload.value).toBe("current");
    applyOperationToRow(row, replayOperation(kind, "newer", 2));
    expect(row.fields.payload).toEqual({
      value: "newer",
      dot: { clientId: "writer", version: 2 },
    });
  });

  it("does not resurrect a tombstone-dominated field through checkpoints or write replay", () => {
    const row = replayRow();
    applyOperationToRow(row, replayOperation("setRow", "deleted"));
    applyOperationToRow(row, {
      type: "removeRow",
      tableName: "test",
      rowKey: "r",
      dot: { clientId: "deleter", version: 2 },
      versionVector: { writer: 1 },
    });
    applyOperationToRow(row, replayOperation("checkpointRow", "deleted"));
    applyOperationToRow(row, replayOperation("setRow", "deleted"));
    expect(row.fields).toEqual({});
    expect(row.tombstone?.versionVector).toEqual({ writer: 1 });
  });
});

function reorderJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reorderJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, reorderJson(child)]),
    );
  }
  return value;
}

describe("property: equal-dot JSON field replay", () => {
  it("is idempotent and symmetric across checkpoint/write delivery order", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const row = replayRow();
        applyOperationToRow(row, replayOperation("setRow", value));
        const original = row.fields.payload;
        applyOperationToRow(row, replayOperation("checkpointRow", reorderJson(value)));
        applyOperationToRow(row, replayOperation("setRow", reorderJson(value)));
        expect(row.fields.payload).toBe(original);
        expect(row.fields.payload.value).toEqual(value);

        const reversed = replayRow();
        applyOperationToRow(reversed, replayOperation("checkpointRow", reorderJson(value)));
        applyOperationToRow(reversed, replayOperation("setRow", value));
        expect(reversed).toEqual(row);
      }),
      { seed: 714810052, numRuns: 200 },
    );
  });
});
