//  ------------------------------------------------------------------------
//  Send Sync request

import { WAL, WALEntry } from "./wal.ts";

//  ------------------------------------------------------------------------
export interface SyncRequest {
  clientId: string;
  entries: WALEntry[];
  clientLastSeenVersion: number;
}

interface SyncResponse {
  entries: WALEntry[];
}

type SyncServerRequest = (wal: WAL, db: IDBPDatabase) => Promise<void>;

export const defaultSendSyncRequest: SyncServerRequest = async (wal, db) => {
  const req = await wal.getEntriesToSync(db);
  const body = { ...req, entries: req.entries.map(encodeWALEntry) };
  try {
    const response = await fetch("http://localhost:9900/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    let syncResponse: SyncResponse = await response.json();
    syncResponse = { ...syncResponse, entries: syncResponse.entries.map(decodeWALEntry) };

    await wal.receiveExternalWALEntries(db, req, syncResponse);
    return;
  } catch (error) {
    console.error("Sync request failed:", error);
    throw error;
  }
};

// Encode key for sending to backend
function encodeKey(key: IDBValidKey): string {
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

// Decode key received from backend
function decodeKey(encoded: string): IDBValidKey {
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

// Updated prepare function
export function encodeWALEntry(entry: WALEntry): WALEntry {
  return {
    ...entry,
    key: encodeKey(entry.key),
    ...(entry.valueKey != null ? { valueKey: encodeKey(entry.valueKey) } : {}),
  };
}

// Updated reconstruct function
export function decodeWALEntry(entry: WALEntry): WALEntry {
  return {
    ...entry,
    key: decodeKey(entry.key as string),
    ...(entry.valueKey != null ? { valueKey: decodeKey(entry.valueKey as string) } : {}),
  };
}
