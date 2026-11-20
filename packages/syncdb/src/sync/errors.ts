/**
 * Error codes that can be returned by the sync server.
 * These match the error codes returned by the sync server.
 */
export enum SyncErrorCode {
  /** Client's lastSeenServerVersion is ahead of server state (e.g., after server reset) */
  CLIENT_STATE_OUT_OF_SYNC = "CLIENT_STATE_OUT_OF_SYNC",
  CLIENT_MUTATION_GAP = "CLIENT_MUTATION_GAP",
  CLIENT_MUTATION_STATE_DIVERGED = "CLIENT_MUTATION_STATE_DIVERGED",
  LOGICAL_CLOCK_REGRESSION = "LOGICAL_CLOCK_REGRESSION",
  
  /** Request integrity check failed (hash mismatch) */
  REQUEST_INTEGRITY_FAILED = "REQUEST_INTEGRITY_FAILED",
  
  /** Response integrity check failed (hash mismatch) */
  RESPONSE_INTEGRITY_FAILED = "RESPONSE_INTEGRITY_FAILED",
  
  /** One or more operations are malformed */
  INVALID_OPERATION = "INVALID_OPERATION",
  
  /** Internal database error occurred */
  DATABASE_ERROR = "DATABASE_ERROR",
  
  /** Client ID is invalid or missing */
  INVALID_CLIENT_ID = "INVALID_CLIENT_ID",

  /** The legacy sync endpoint has been retired; use the versioned endpoint. */
  SYNC_ENDPOINT_RETIRED = "SYNC_ENDPOINT_RETIRED",
}

/**
 * Structured error returned by the sync API
 */
export interface SyncError {
  code: SyncErrorCode;
  message: string;
}

/**
 * Type guard to check if an error is a SyncError
 */
export function isSyncError(value: any): value is SyncError {
  return (
    value &&
    typeof value === "object" &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}
