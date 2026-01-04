// Main functionality
export { openAppDb, dbCommands, dbQueries, INTERNAL_DB_STORES, type InternalDbSchema } from './db.ts';
export { WAL } from './wal.ts';
export { proxyIdb } from './proxies.ts';
export { Scheduler } from './scheduler.ts';
export * as logicalClock from './persistedLogicalClock.ts';

// Types
export type { WALOperation, SyncRequest, SyncResponse } from './types.ts';

// Sync functionality
export { createSyncRequest, applySyncResponse, sendSyncRequest, hashSyncRequest, hashSyncResponse, validateSyncResponse } from './sync_request.ts';

// Serialization
export { encodeWALOperation, decodeWALOperation, encodeKey, decodeKey } from './serialization.ts';
