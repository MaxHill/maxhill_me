/**
 * Sets up fake IndexedDB globals for Deno environment.
 * 
 * Deno doesn't have native IndexedDB support, so we use fake-indexeddb
 * to polyfill all the necessary globals that the `idb` library expects.
 * 
 * Import this module before using any IndexedDB functionality:
 * ```ts
 * import "./setup-indexeddb.ts";
 * ```
 */

// Import all fake-indexeddb components
import fakeIndexedDB from "npm:fake-indexeddb@^6.0.0/lib/fakeIndexedDB";
import FDBCursor from "npm:fake-indexeddb@^6.0.0/lib/FDBCursor";
import FDBCursorWithValue from "npm:fake-indexeddb@^6.0.0/lib/FDBCursorWithValue";
import FDBDatabase from "npm:fake-indexeddb@^6.0.0/lib/FDBDatabase";
import FDBFactory from "npm:fake-indexeddb@^6.0.0/lib/FDBFactory";
import FDBIndex from "npm:fake-indexeddb@^6.0.0/lib/FDBIndex";
import FDBKeyRange from "npm:fake-indexeddb@^6.0.0/lib/FDBKeyRange";
import FDBObjectStore from "npm:fake-indexeddb@^6.0.0/lib/FDBObjectStore";
import FDBOpenDBRequest from "npm:fake-indexeddb@^6.0.0/lib/FDBOpenDBRequest";
import FDBRequest from "npm:fake-indexeddb@^6.0.0/lib/FDBRequest";
import FDBTransaction from "npm:fake-indexeddb@^6.0.0/lib/FDBTransaction";
import FDBVersionChangeEvent from "npm:fake-indexeddb@^6.0.0/lib/FDBVersionChangeEvent";

// Set up all IndexedDB globals
// @ts-ignore - Polyfilling browser globals
globalThis.indexedDB = fakeIndexedDB;
// @ts-ignore
globalThis.IDBCursor = FDBCursor;
// @ts-ignore
globalThis.IDBCursorWithValue = FDBCursorWithValue;
// @ts-ignore
globalThis.IDBDatabase = FDBDatabase;
// @ts-ignore
globalThis.IDBFactory = FDBFactory;
// @ts-ignore
globalThis.IDBIndex = FDBIndex;
// @ts-ignore
globalThis.IDBKeyRange = FDBKeyRange;
// @ts-ignore
globalThis.IDBObjectStore = FDBObjectStore;
// @ts-ignore
globalThis.IDBOpenDBRequest = FDBOpenDBRequest;
// @ts-ignore
globalThis.IDBRequest = FDBRequest;
// @ts-ignore
globalThis.IDBTransaction = FDBTransaction;
// @ts-ignore
globalThis.IDBVersionChangeEvent = FDBVersionChangeEvent;
