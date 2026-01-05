import { ORMap, ORMapEntry, ORMapMerge } from "./crdt.ts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("ORMap", () => {
  it("Merge", () => {
    const map1: ORMap<string> = {
      entries: {
        key1: {
          type: "active",
          value: "string_value",
          timestamp: 0,
        },
      },
    };

    const map2: ORMap<string> = {
      entries: {
        key1: {
          type: "active",
          value: "string_value_winning",
          timestamp: 1,
        },
      },
    };

    expect(ORMapMerge(map1, map2)).toEqual({
      entries: {
        key1: {
          type: "active",
          value: "string_value_winning",
          timestamp: 1,
        },
      },
    });
  });

  it("property merge", () => {
    fc.assert(
      fc.property(
        generateORMap(),
        generateORMap(),
        (map1: ORMap<string>, map2: ORMap<string>) => {
          const merged = ORMapMerge(map1, map2);

          [map1, map2].forEach((map) => {
            Object.entries(map.entries).forEach(([key, value]) => {
              expect(merged.entries[key]).not.toBe(undefined);
              expect(merged.entries[key].timestamp >= value.timestamp).toBe(true);
            });
          });
        },
      ),
    );
  });
});

function generateORMapEntry(): fc.Arbitrary<ORMapEntry<string>> {
  return fc.oneof(
    fc.record({
      type: fc.constant("tombstone" as const),
      timestamp: fc.nat(99),
    }),
    fc.record({
      type: fc.constant("active" as const),
      value: fc.string(),
      timestamp: fc.nat(99),
    }),
  );
}

function generateORMap(): fc.Arbitrary<ORMap<string>> {
  return fc.record({
    entries: fc.array(generateORMapEntry()),
  });
}
