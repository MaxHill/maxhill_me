import { jsonValuesEqual } from "../json-values-equal.ts";

const utf8Encoder = new TextEncoder();

type CanonicalJsonEncoding =
  | ["null"]
  | ["bool", boolean]
  | ["string", string]
  | ["number", string]
  | ["array", CanonicalJsonEncoding[]]
  | ["object", Array<[string, CanonicalJsonEncoding]>];

export function encodeCanonicalJson(value: unknown): string {
  assertStrictJsonValue(value);
  return JSON.stringify(encodeCanonicalJsonValue(value));
}

function assertStrictJsonValue(value: unknown): asserts value {
  if (!jsonValuesEqual(value, value)) {
    throw new Error("Invalid data: value must be strict JSON");
  }
}

function encodeCanonicalJsonValue(value: unknown): CanonicalJsonEncoding {
  if (value === null) {
    return ["null"];
  }

  if (typeof value === "boolean") {
    return ["bool", value];
  }

  if (typeof value === "string") {
    return ["string", value];
  }

  if (typeof value === "number") {
    return ["number", encodeFloat64Hex(value)];
  }

  if (Array.isArray(value)) {
    const encodedItems: CanonicalJsonEncoding[] = [];
    for (let index = 0; index < value.length; index += 1) {
      encodedItems.push(encodeCanonicalJsonValue(value[index]));
    }
    return ["array", encodedItems];
  }

  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort(compareUtf8);
  const encodedEntries: Array<[string, CanonicalJsonEncoding]> = [];
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(objectValue, key);
    if (!property || !property.enumerable || !("value" in property)) {
      throw new Error("Invalid data: object properties must be enumerable data properties");
    }
    encodedEntries.push([key, encodeCanonicalJsonValue(property.value)]);
  }

  return ["object", encodedEntries];
}

function encodeFloat64Hex(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setFloat64(0, normalized, false);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function compareUtf8(left: string, right: string): number {
  const leftBytes = utf8Encoder.encode(left);
  const rightBytes = utf8Encoder.encode(right);
  const minLength = Math.min(leftBytes.length, rightBytes.length);
  for (let i = 0; i < minLength; i += 1) {
    if (leftBytes[i] !== rightBytes[i]) {
      return leftBytes[i] - rightBytes[i];
    }
  }
  return leftBytes.length - rightBytes.length;
}
