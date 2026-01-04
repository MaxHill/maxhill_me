import type { WALEntry } from "./types.ts";

/**
 * Encode an IndexedDB key for transmission over the network.
 * Adds type prefix to ensure correct deserialization.
 */
export function encodeKey(key: IDBValidKey): string {
  if (typeof key === "string") {
    return `string:${key}`;
  } else if (typeof key === "number") {
    return `number:${key}`;
  } else if (key instanceof Date) {
    return `json:${JSON.stringify(key.toISOString())}`;
  } else if (key instanceof ArrayBuffer) {
    // Convert ArrayBuffer to base64
    const base64 = btoa(String.fromCharCode(...new Uint8Array(key)));
    return `json:${JSON.stringify(base64)}`;
  } else if (ArrayBuffer.isView(key)) {
    // Handle typed arrays
    const base64 = btoa(String.fromCharCode(...new Uint8Array(key.buffer)));
    return `json:${JSON.stringify(base64)}`;
  } else if (Array.isArray(key)) {
    return `array:${JSON.stringify(key)}`;
  } else {
    return `json:${JSON.stringify(key)}`;
  }
}

/**
 * Decode a key received from the network back to its original type.
 */
export function decodeKey(encoded: string): IDBValidKey {
  const colonIndex = encoded.indexOf(":");
  if (colonIndex === -1) {
    return encoded; // fallback for unprefixed values
  }

  const prefix = encoded.substring(0, colonIndex);
  const value = encoded.substring(colonIndex + 1);

  switch (prefix) {
    case "string": {
      return value;
    }
    case "number": {
      return parseFloat(value);
    }
    case "array": {
      return JSON.parse(value);
    }
    case "json": {
      const parsed = JSON.parse(value);
      // Try to reconstruct Date objects
      if (typeof parsed === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(parsed)) {
        return new Date(parsed);
      }
      return parsed;
    }
    default: {
      return encoded;
    }
  }
}

/**
 * Encode a WAL entry for transmission to the server.
 * Converts complex keys to strings that can be safely serialized to JSON.
 */
export function encodeWALEntry(entry: WALEntry): WALEntry {
  return {
    ...entry,
    key: encodeKey(entry.key),
    ...(entry.valueKey != null ? { valueKey: encodeKey(entry.valueKey) } : {}),
  };
}

/**
 * Decode a WAL entry received from the server.
 * Restores keys to their original types.
 */
export function decodeWALEntry(entry: WALEntry): WALEntry {
  return {
    ...entry,
    key: decodeKey(entry.key as string),
    ...(entry.valueKey != null ? { valueKey: decodeKey(entry.valueKey as string) } : {}),
  };
}
