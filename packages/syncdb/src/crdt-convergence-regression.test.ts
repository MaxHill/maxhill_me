import { describe, expect, it } from "vitest";
import {
  applyOperationToRow,
  type CRDTOperation,
  type ORMapRow,
  ROW_KEY,
  TABLE_NAME,
} from "./crdt.ts";

function applyInOrder(initial: ORMapRow, operations: CRDTOperation[]): ORMapRow {
  const row: ORMapRow = structuredClone(initial);
  for (const operation of operations) {
    applyOperationToRow(row, operation);
  }
  return row;
}

describe("contender checkpoint retention", () => {
  it("retains contenders through serialized checkpoints and overlapping replay", () => {
    const initial: ORMapRow = { [TABLE_NAME]: "test", [ROW_KEY]: "r", fields: {} };
    const writes: CRDTOperation[] = ["a", "b", "c"].map((clientId) => ({
      type: "setRow", tableName: "test", rowKey: "r",
      fields: { name: clientId }, dot: { clientId, version: 1 },
    }));
    const snapshot = applyInOrder(initial, writes);
    const checkpoint: CRDTOperation = JSON.parse(JSON.stringify({
      type: "checkpointRow", tableName: "test", rowKey: "r",
      dot: { clientId: "checkpoint", version: 100 },
      checkpointSeenServerVersion: 10, fields: snapshot.fields,
    }));
    const deletes: CRDTOperation[] = ["c", "b"].map((clientId) => ({
      type: "removeRow", tableName: "test", rowKey: "r",
      dot: { clientId, version: 2 }, versionVector: { [clientId]: 1 },
    }));
    const expected = applyInOrder(initial, [...writes, ...deletes]);
    expect(expected.fields.name).toEqual({ value: "a", dot: { clientId: "a", version: 1 } });
    expect(applyInOrder(initial, [checkpoint, ...writes, ...deletes])).toEqual(expected);
    expect(applyInOrder(initial, [...deletes, checkpoint, ...writes])).toEqual(expected);
    // Same-client overwritten values are not retained or resurrected.
    const newer: CRDTOperation = {
      type: "setRow", tableName: "test", rowKey: "r",
      fields: { name: "new" }, dot: { clientId: "a", version: 3 },
    };
    const remove: CRDTOperation = {
      type: "removeRow", tableName: "test", rowKey: "r",
      dot: { clientId: "a", version: 4 }, versionVector: { a: 3 },
    };
    expect(applyInOrder(expected, [newer, remove, writes[0]]).fields).toEqual({});
  });
});

describe("observed-remove convergence regression", () => {
  it("replays the counterexample from fast-check seed 223012321", () => {
    const initial: ORMapRow = {
      [TABLE_NAME]: "test_table",
      [ROW_KEY]: "",
      fields: { S: { value: "", dot: { clientId: "client1", version: 0 } } },
      tombstone: { dot: { clientId: "client1", version: 0 }, versionVector: {} },
    };
    const operations: CRDTOperation[] = [
      {
        type: "setRow", tableName: "test_table", rowKey: "",
        fields: { S: null }, dot: { clientId: "client4", version: 0 },
      },
      {
        type: "removeRow", tableName: "test_table", rowKey: "",
        dot: { clientId: "client1", version: 0 }, versionVector: { client4: 0 },
      },
      {
        type: "setRow", tableName: "test_table", rowKey: "",
        fields: { " ": 0 }, dot: { clientId: "client1", version: 802 },
      },
    ];
    expect(applyInOrder(initial, operations)).toEqual(
      applyInOrder(initial, [...operations].reverse()),
    );
  });

  it("preserves an unobserved concurrent write when the LWW winner is removed", () => {
    // The writers are offline from one another. The remover sees only writer B.
    // All dots are unique, clocks are positive, and the delete follows its context.
    const initial: ORMapRow = { [TABLE_NAME]: "test", [ROW_KEY]: "r", fields: {} };
    const concurrent: CRDTOperation = {
      type: "setRow", tableName: "test", rowKey: "r",
      fields: { name: "A" }, dot: { clientId: "a", version: 1 },
    };
    const observed: CRDTOperation = {
      type: "setRow", tableName: "test", rowKey: "r",
      fields: { name: "B" }, dot: { clientId: "b", version: 1 },
    };
    const remove: CRDTOperation = {
      type: "removeRow", tableName: "test", rowKey: "r",
      dot: { clientId: "b", version: 2 }, versionVector: { b: 1 },
    };
    const deliveredAfterDelete = applyInOrder(initial, [observed, remove, concurrent]);
    expect(deliveredAfterDelete.fields.name).toEqual({ value: "A", dot: concurrent.dot });
    expect(applyInOrder(initial, [concurrent, observed, remove])).toEqual(deliveredAfterDelete);
  });
});
