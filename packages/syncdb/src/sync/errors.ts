/**
 * Error codes that can be returned by the sync server.
 * These match the error codes defined in the Go server.
 */
export enum SyncErrorCode {
  /** Client's lastSeenServerVersion is ahead of server state (e.g., after server reset) */
  CLIENT_STATE_OUT_OF_SYNC = "CLIENT_STATE_OUT_OF_SYNC",
  
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
export function isSyncError(obj: any): obj is SyncError {
  return (
    obj &&
    typeof obj === "object" &&
    "code" in obj &&
    "message" in obj &&
    typeof obj.code === "string" &&
    typeof obj.message === "string"
  );
}
