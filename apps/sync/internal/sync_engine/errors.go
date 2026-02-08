package sync_engine

import "fmt"

// SyncErrorCode represents specific error types that can occur during sync
type SyncErrorCode string

const (
	// ErrClientStateOutOfSync indicates the client's lastSeenServerVersion
	// is ahead of the actual server state (e.g., after server database reset)
	ErrClientStateOutOfSync SyncErrorCode = "CLIENT_STATE_OUT_OF_SYNC"

	// ErrRequestIntegrity indicates the request integrity check failed
	ErrRequestIntegrity SyncErrorCode = "REQUEST_INTEGRITY_FAILED"

	// ErrResponseIntegrity indicates the response integrity check failed
	ErrResponseIntegrity SyncErrorCode = "RESPONSE_INTEGRITY_FAILED"

	// ErrInvalidOperation indicates one or more operations are malformed
	ErrInvalidOperation SyncErrorCode = "INVALID_OPERATION"

	// ErrDatabaseError indicates an internal database error occurred
	ErrDatabaseError SyncErrorCode = "DATABASE_ERROR"

	// ErrInvalidClientID indicates the client ID is invalid or missing
	ErrInvalidClientID SyncErrorCode = "INVALID_CLIENT_ID"
)

// SyncError represents a structured error returned by the sync API
type SyncError struct {
	Code    SyncErrorCode `json:"code"`
	Message string        `json:"message"`
}

// Error implements the error interface
func (e *SyncError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// NewSyncError creates a new SyncError with the given code and message
func NewSyncError(code SyncErrorCode, message string) *SyncError {
	return &SyncError{
		Code:    code,
		Message: message,
	}
}

// NewSyncErrorf creates a new SyncError with formatted message
func NewSyncErrorf(code SyncErrorCode, format string, args ...interface{}) *SyncError {
	return &SyncError{
		Code:    code,
		Message: fmt.Sprintf(format, args...),
	}
}
