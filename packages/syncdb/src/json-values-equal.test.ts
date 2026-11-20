import { describe, expect, it } from "vitest";
import { jsonValuesEqual } from "./json-values-equal.ts";

describe("strict JSON value equality", () => {
  it.each([
    [null, null, true],
    [true, true, true],
    [false, true, false],
    ["same", "same", true],
    ["1", 1, false],
    [0, -0, true],
    [1, 2, false],
    [null, false, false],
    [NaN, NaN, false],
    [Infinity, Infinity, false],
    [NaN, null, false],
    [undefined, undefined, false],
  ])("compares primitives %j and %j", (left, right, expected) => {
    expect(jsonValuesEqual(left, right)).toBe(expected);
  });

  it.each([
    [{}, {}, true],
    [[], [], true],
    [[1, { a: true, b: null }], [1, { b: null, a: true }], true],
    [{ nested: { a: 1, b: ["x"] } }, { nested: { b: ["x"], a: 1 } }, true],
    [[1, 2], [2, 1], false],
    [[1], [1, 2], false],
    [[], {}, false],
    [{ a: null }, { b: null }, false],
    [{ a: null }, {}, false],
    [{ a: { b: true } }, { a: { b: false } }, false],
  ])("compares structures %j and %j", (left, right, expected) => {
    expect(jsonValuesEqual(left, right)).toBe(expected);
    expect(jsonValuesEqual(right, left)).toBe(expected);
  });
});

describe("unsupported JSON equality inputs", () => {
  it.each([
    new Date("2026-01-01"), new Map(), new Set(), /x/, new Number(1),
    undefined, Symbol("x"), 1n, () => 1, NaN, Infinity, -Infinity,
    { nested: undefined }, { nested: () => 1 }, [undefined], Array(1),
  ].map((value) => ({ value })))(
    "does not accept an unsupported value even against itself (case %#)",
    ({ value }) => {
      expect(jsonValuesEqual(value, value)).toBe(false);
    },
  );

  it("rejects sparse arrays even when an extra key balances their key count", () => {
    const value = Object.assign(Array(1), { extra: 1 });
    expect(jsonValuesEqual(value, value)).toBe(false);
  });

  it("rejects cycles without treating shared references as cycles", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(jsonValuesEqual(cycle, cycle)).toBe(false);
    const shared = { value: 1 };
    expect(jsonValuesEqual([shared, shared], [{ value: 1 }, { value: 1 }])).toBe(true);
  });

  it("does not invoke accessors or toJSON", () => {
    const value = Object.defineProperty({}, "value", {
      enumerable: true,
      get() { throw new Error("must not invoke getter"); },
    });
    expect(jsonValuesEqual(value, value)).toBe(false);
    const withToJSON = { toJSON() { throw new Error("must not invoke toJSON"); } };
    expect(jsonValuesEqual(withToJSON, withToJSON)).toBe(false);
  });
});

describe("JSON record ownership and immutability", () => {
  it("compares null-prototype records by content", () => {
    const value = Object.assign(Object.create(null), { nested: [1, null] });
    expect(jsonValuesEqual(value, { nested: [1, null] })).toBe(true);
  });

  it("treats special own keys as data without mutation", () => {
    const left = JSON.parse('{"__proto__":{"polluted":true},"constructor":1}');
    const right = JSON.parse('{"constructor":1,"__proto__":{"polluted":true}}');
    Object.freeze(Object.getOwnPropertyDescriptor(left, "__proto__")!.value);
    Object.freeze(left);
    Object.freeze(right);
    expect(jsonValuesEqual(left, right)).toBe(true);
    expect(Object.getPrototypeOf(left)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
});
