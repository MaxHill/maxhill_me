import { describe, expect, it } from "vitest";
import { encodeCanonicalJson } from "./canonical-json.ts";

describe("encodeCanonicalJson", () => {
  it("encodes finite numbers as float64 big-endian hex", () => {
    expect(encodeCanonicalJson(1e-6)).toBe('["number","3eb0c6f7a0b5ed8d"]');
    expect(encodeCanonicalJson(1e-7)).toBe('["number","3e7ad7f29abcaf48"]');
    expect(encodeCanonicalJson(1e20)).toBe('["number","4415af1d78b58c40"]');
  });

  it("normalizes negative zero to positive zero", () => {
    expect(encodeCanonicalJson(-0)).toBe('["number","0000000000000000"]');
    expect(encodeCanonicalJson(0)).toBe('["number","0000000000000000"]');
  });

  it("encodes arrays and objects with typed tags", () => {
    const encodedArray = encodeCanonicalJson([null, true, "x", 1]);
    expect(encodedArray).toBe(
      '["array",[["null"],["bool",true],["string","x"],["number","3ff0000000000000"]]]',
    );

    const encodedObject = encodeCanonicalJson({ a: [1], b: { c: false } });
    expect(encodedObject).toBe(
      [
        '["object",[["a",["array",[["number","3ff0000000000000"]]]],',
        '["b",["object",[["c",["bool",false]]]]]]]',
      ].join(""),
    );
  });

  it("sorts object keys by UTF-8 byte order", () => {
    expect(
      encodeCanonicalJson({ "é": 1, z: 2, "€": 3, a: 4 }),
    ).toBe(
      [
        '["object",[["a",["number","4010000000000000"]],',
        '["z",["number","4000000000000000"]],',
        '["é",["number","3ff0000000000000"]],',
        '["€",["number","4008000000000000"]]]]',
      ].join(""),
    );
  });

  it.each([
    undefined,
    new Date("2026-01-01T00:00:00.000Z"),
    NaN,
    Infinity,
    { nested: undefined },
    [undefined],
    { toJSON() { return "x"; } },
  ])("rejects invalid data: %j", (value) => {
    expect(() => encodeCanonicalJson(value)).toThrow("Invalid data");
  });
});
