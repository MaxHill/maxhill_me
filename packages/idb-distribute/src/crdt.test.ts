import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  compareDots,
  applyOpToRow,
  type Dot,
  type LWWField,
  type ORMapRow,
  type CRDTOperation,
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
  fc.string({ minLength: 1, maxLength: 10 }).filter(
    (s) => !["__proto__", "constructor", "prototype", "toString", "valueOf"].includes(s)
  );

const generateORMapRow = (): fc.Arbitrary<ORMapRow> =>
  fc.record({
    fields: fc.dictionary(generateSafeFieldName(), generateLWWField()),
    tombstone: fc.option(
      fc.record({
        dot: generateDot(),
        context: fc.dictionary(generateClientId(), fc.nat({ max: 1000 })),
      }),
      { nil: undefined }
    ),
  });

const generateSetOp = (): fc.Arbitrary<CRDTOperation> =>
  fc.record({
    type: fc.constant("set" as const),
    table: fc.constant("test_table"),
    rowKey: fc.oneof(fc.string(), fc.integer()),
    field: generateSafeFieldName(),
    value: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    dot: generateDot(),
  });

const generateSetRowOp = (): fc.Arbitrary<CRDTOperation> =>
  fc.record({
    type: fc.constant("setRow" as const),
    table: fc.constant("test_table"),
    rowKey: fc.oneof(fc.string(), fc.integer()),
    value: fc.dictionary(
      generateSafeFieldName(),
      fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))
    ),
    dot: generateDot(),
  });

const generateRemoveOp = (): fc.Arbitrary<CRDTOperation> =>
  fc.record({
    type: fc.constant("remove" as const),
    table: fc.constant("test_table"),
    rowKey: fc.oneof(fc.string(), fc.integer()),
    dot: generateDot(),
    context: fc.dictionary(generateClientId(), fc.nat({ max: 1000 })),
  });

const generateCRDTOp = (): fc.Arbitrary<CRDTOperation> =>
  fc.oneof(generateSetOp(), generateSetRowOp(), generateRemoveOp());

//  ------------------------------------------------------------------------
//  compareDots Tests
//  ------------------------------------------------------------------------

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
        })
      );
    });

    it("antisymmetric: compareDots(a, b) === -compareDots(b, a)", () => {
      fc.assert(
        fc.property(generateDot(), generateDot(), (a, b) => {
          const ab = compareDots(a, b);
          const ba = compareDots(b, a);
          // Use == instead of toBe to avoid +0/-0 distinction
          expect(ab).toEqual(-ba);
        })
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
        })
      );
    });

    it("total order: any two dots are comparable", () => {
      fc.assert(
        fc.property(generateDot(), generateDot(), (a, b) => {
          const result = compareDots(a, b);
          expect(typeof result).toBe("number");
          expect(result === 0 || result > 0 || result < 0).toBe(true);
        })
      );
    });
  });
});

//  ------------------------------------------------------------------------
//  applyOpToRow Tests
//  ------------------------------------------------------------------------

describe("applyOpToRow", () => {
  describe("set operations", () => {
    it("should apply set to empty row", () => {
      const row: ORMapRow = { fields: {} };
      const op: CRDTOperation = {
        type: "set",
        table: "test",
        rowKey: "row1",
        field: "name",
        value: "Alice",
        dot: { clientId: "client1", version: 1 },
      };

      applyOpToRow(row, op);

      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client1", version: 1 },
      });
    });

    it("should replace field when new dot is higher (LWW)", () => {
      const row: ORMapRow = {
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 1 } },
        },
      };
      const op: CRDTOperation = {
        type: "set",
        table: "test",
        rowKey: "row1",
        field: "name",
        value: "Bob",
        dot: { clientId: "client1", version: 2 },
      };

      applyOpToRow(row, op);

      expect(row.fields.name.value).toBe("Bob");
      expect(row.fields.name.dot.version).toBe(2);
    });

    it("should ignore set when existing dot is higher", () => {
      const row: ORMapRow = {
        fields: {
          name: { value: "Bob", dot: { clientId: "client1", version: 5 } },
        },
      };
      const op: CRDTOperation = {
        type: "set",
        table: "test",
        rowKey: "row1",
        field: "name",
        value: "Alice",
        dot: { clientId: "client1", version: 3 },
      };

      applyOpToRow(row, op);

      expect(row.fields.name.value).toBe("Bob");
      expect(row.fields.name.dot.version).toBe(5);
    });

    it("should use clientId tiebreaker when versions are equal", () => {
      const row: ORMapRow = {
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 5 } },
        },
      };
      const op: CRDTOperation = {
        type: "set",
        table: "test",
        rowKey: "row1",
        field: "name",
        value: "Bob",
        dot: { clientId: "client2", version: 5 },
      };

      applyOpToRow(row, op);

      // client2 > client1 lexicographically
      expect(row.fields.name.value).toBe("Bob");
      expect(row.fields.name.dot.clientId).toBe("client2");
    });

    it("should throw error when field is missing in set operation", () => {
      const row: ORMapRow = { fields: {} };
      const op: CRDTOperation = {
        type: "set",
        table: "test",
        rowKey: "row1",
        field: undefined as any,
        value: "Alice",
        dot: { clientId: "client1", version: 1 },
      };

      expect(() => applyOpToRow(row, op)).toThrow("Set operation is missing field");
    });

    it("should reject set dominated by tombstone", () => {
      const row: ORMapRow = {
        fields: {},
        tombstone: {
          dot: { clientId: "client1", version: 10 },
          context: { client1: 5 },
        },
      };
      const op: CRDTOperation = {
        type: "set",
        table: "test",
        rowKey: "row1",
        field: "name",
        value: "Alice",
        dot: { clientId: "client1", version: 5 },
      };

      applyOpToRow(row, op);

      expect(row.fields.name).toBeUndefined();
    });

    it("should allow set with higher version than tombstone context", () => {
      const row: ORMapRow = {
        fields: {},
        tombstone: {
          dot: { clientId: "client1", version: 10 },
          context: { client1: 5 },
        },
      };
      const op: CRDTOperation = {
        type: "set",
        table: "test",
        rowKey: "row1",
        field: "name",
        value: "Alice",
        dot: { clientId: "client1", version: 6 },
      };

      applyOpToRow(row, op);

      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client1", version: 6 },
      });
    });

    it("should allow set from client not in tombstone context", () => {
      const row: ORMapRow = {
        fields: {},
        tombstone: {
          dot: { clientId: "client1", version: 10 },
          context: { client1: 5 },
        },
      };
      const op: CRDTOperation = {
        type: "set",
        table: "test",
        rowKey: "row1",
        field: "name",
        value: "Alice",
        dot: { clientId: "client2", version: 1 },
      };

      applyOpToRow(row, op);

      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client2", version: 1 },
      });
    });

    it("property: LWW convergence - operations applied in any order yield same result", () => {
      fc.assert(
        fc.property(
          generateORMapRow(),
          fc.array(generateSetOp(), { minLength: 2, maxLength: 5 }),
          (initialRow, ops) => {
            // Ensure all ops target the same field
            const field = "testField";
            const normalizedOps = ops.map((op) => ({ ...op, field }));

            // Apply in original order
            const row1: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            normalizedOps.forEach((op) => applyOpToRow(row1, op));

            // Apply in reverse order
            const row2: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            [...normalizedOps].reverse().forEach((op) => applyOpToRow(row2, op));

            // Both should converge to same result
            expect(row1.fields[field]).toEqual(row2.fields[field]);
          }
        )
      );
    });
  });

  describe("setRow operations", () => {
    it("should set multiple fields with same dot", () => {
      const row: ORMapRow = { fields: {} };
      const op: CRDTOperation = {
        type: "setRow",
        table: "test",
        rowKey: "row1",
        value: { name: "Alice", age: 30 },
        dot: { clientId: "client1", version: 1 },
      };

      applyOpToRow(row, op);

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
        fields: {
          name: { value: "Bob", dot: { clientId: "client1", version: 5 } },
          age: { value: 25, dot: { clientId: "client1", version: 2 } },
        },
      };
      const op: CRDTOperation = {
        type: "setRow",
        table: "test",
        rowKey: "row1",
        value: { name: "Alice", age: 30 },
        dot: { clientId: "client1", version: 3 },
      };

      applyOpToRow(row, op);

      // name stays Bob (version 5 > 3)
      expect(row.fields.name.value).toBe("Bob");
      // age updates to 30 (version 3 > 2)
      expect(row.fields.age.value).toBe(30);
    });

    it("should reject setRow dominated by tombstone", () => {
      const row: ORMapRow = {
        fields: {},
        tombstone: {
          dot: { clientId: "client1", version: 10 },
          context: { client1: 5 },
        },
      };
      const op: CRDTOperation = {
        type: "setRow",
        table: "test",
        rowKey: "row1",
        value: { name: "Alice", age: 30 },
        dot: { clientId: "client1", version: 5 },
      };

      applyOpToRow(row, op);

      expect(Object.keys(row.fields)).toHaveLength(0);
    });

    it("property: concurrent setRow operations converge", () => {
      fc.assert(
        fc.property(
          generateORMapRow(),
          generateSetRowOp(),
          generateSetRowOp(),
          (initialRow, op1, op2) => {
            // Apply ops in both orders
            const row1: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            applyOpToRow(row1, op1);
            applyOpToRow(row1, op2);

            const row2: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            applyOpToRow(row2, op2);
            applyOpToRow(row2, op1);

            // Should converge
            expect(row1).toEqual(row2);
          }
        )
      );
    });
  });

  describe("remove operations", () => {
    it("should create tombstone and remove dominated fields", () => {
      const row: ORMapRow = {
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 3 } },
          age: { value: 30, dot: { clientId: "client2", version: 2 } },
        },
      };
      const op: CRDTOperation = {
        type: "remove",
        table: "test",
        rowKey: "row1",
        dot: { clientId: "client1", version: 10 },
        context: { client1: 5, client2: 2 },
      };

      applyOpToRow(row, op);

      // age is dominated (client2: 2 <= 2), name is not (client1: 3 > 5 is false, but 3 <= 5)
      expect(row.fields.name).toBeUndefined();
      expect(row.fields.age).toBeUndefined();
      expect(row.tombstone).toEqual({
        dot: { clientId: "client1", version: 10 },
        context: { client1: 5, client2: 2 },
      });
    });

    it("should keep fields with versions higher than tombstone context", () => {
      const row: ORMapRow = {
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 6 } },
          age: { value: 30, dot: { clientId: "client2", version: 2 } },
        },
      };
      const op: CRDTOperation = {
        type: "remove",
        table: "test",
        rowKey: "row1",
        dot: { clientId: "client1", version: 10 },
        context: { client1: 5, client2: 2 },
      };

      applyOpToRow(row, op);

      // name survives (6 > 5), age is removed (2 <= 2)
      expect(row.fields.name).toEqual({
        value: "Alice",
        dot: { clientId: "client1", version: 6 },
      });
      expect(row.fields.age).toBeUndefined();
    });

    it("should keep fields from clients not in tombstone context", () => {
      const row: ORMapRow = {
        fields: {
          name: { value: "Alice", dot: { clientId: "client1", version: 3 } },
          age: { value: 30, dot: { clientId: "client3", version: 1 } },
        },
      };
      const op: CRDTOperation = {
        type: "remove",
        table: "test",
        rowKey: "row1",
        dot: { clientId: "client1", version: 10 },
        context: { client1: 5 },
      };

      applyOpToRow(row, op);

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
          generateRemoveOp(),
          fc.array(generateSetOp(), { minLength: 1, maxLength: 5 }),
          (removeOp, setOps) => {
            const row: ORMapRow = { fields: {} };

            // Apply all sets with versions <= context
            const dominatedSets = setOps.map((op) => {
              const clientId = op.dot.clientId;
              const contextVersion = removeOp.context[clientId];
              if (contextVersion !== undefined) {
                return {
                  ...op,
                  dot: { clientId, version: Math.min(op.dot.version, contextVersion) },
                };
              }
              return op;
            });

            dominatedSets.forEach((op) => applyOpToRow(row, op));
            applyOpToRow(row, removeOp);

            // All fields from clients in context with version <= context should be gone
            Object.values(row.fields).forEach((field) => {
              const contextVersion = removeOp.context[field.dot.clientId];
              if (contextVersion !== undefined) {
                expect(field.dot.version).toBeGreaterThan(contextVersion);
              }
            });
          }
        )
      );
    });

    it("property: resurrection possible with dots higher than tombstone context", () => {
      fc.assert(
        fc.property(
          generateORMapRow(),
          generateRemoveOp(),
          generateSetOp(),
          (initialRow, removeOp, setOp) => {
            const row: ORMapRow = JSON.parse(JSON.stringify(initialRow));

            // Apply remove
            applyOpToRow(row, removeOp);

            // Check the FINAL merged context after remove operation
            const finalContext = row.tombstone?.context ?? {};
            const clientId = setOp.dot.clientId;
            const contextVersion = finalContext[clientId] ?? 0;
            
            // Create a set with version higher than the merged context
            const resurrectOp: CRDTOperation = {
              ...setOp,
              dot: { clientId, version: contextVersion + 1 },
            };

            applyOpToRow(row, resurrectOp);

            // Field should exist because version is higher than context
            if (resurrectOp.type === "set" && resurrectOp.field) {
              expect(row.fields[resurrectOp.field]).toBeDefined();
            }
          }
        )
      );
    });
  });

  describe("property: general convergence", () => {
    it("operations applied in any order should converge", () => {
      fc.assert(
        fc.property(
          generateORMapRow(),
          fc.array(generateCRDTOp(), { minLength: 2, maxLength: 10 }),
          (initialRow, ops) => {
            // Apply in original order
            const row1: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            ops.forEach((op) => {
              try {
                applyOpToRow(row1, op);
              } catch (e) {
                // Ignore errors from missing fields in set ops
              }
            });

            // Apply in shuffled order
            const row2: ORMapRow = JSON.parse(JSON.stringify(initialRow));
            const shuffled = [...ops].sort(() => Math.random() - 0.5);
            shuffled.forEach((op) => {
              try {
                applyOpToRow(row2, op);
              } catch (e) {
                // Ignore errors from missing fields in set ops
              }
            });

            // Should converge to same state
            expect(row1).toEqual(row2);
          }
        )
      );
    });
  });
});
