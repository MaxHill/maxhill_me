package server

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync/internal/sync_engine"

	// TODO: remove dependency
	"github.com/google/uuid"
)

// ------------------------------------------------------------------------
// Server
// ------------------------------------------------------------------------

type Server struct {
	SyncService sync_engine.SyncServiceInterface
}

func NewServer(syncService sync_engine.SyncServiceInterface, maxConcurrentConnections int) *http.ServeMux {
	server := Server{
		SyncService: syncService,
	}

	mux := http.NewServeMux()

	// Handle OPTIONS for CORS preflight
	mux.HandleFunc("OPTIONS /sync", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	// Handle POST for actual sync requests
	mux.HandleFunc("POST /sync", limitConcurrency(server.HandleSync, maxConcurrentConnections))

	return mux
}

// ------------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------------

// HandleSync handles sync requests from clients
func (server Server) HandleSync(writer http.ResponseWriter, request *http.Request) {
	// We're setting content type at the top so the error
	// responses get the correct content type.
	writer.Header().Set("Content-Type", "application/json")

	body, err := io.ReadAll(request.Body)
	if err != nil {
		writer.WriteHeader(http.StatusBadRequest)
		writer.Write([]byte(`{"error": "Failed to read request body"}`))
		return
	}
	defer request.Body.Close()

	var syncReq sync_engine.SyncRequest
	if err := json.Unmarshal(body, &syncReq); err != nil {
		writer.WriteHeader(http.StatusBadRequest)
		writer.Write([]byte(`{"error": "Invalid JSON format"}`))
		return
	}
	// TODO: maybe this should not be assertions but handled with returned error
	err = uuid.Validate(syncReq.ClientID)

	if err != nil {
		writer.WriteHeader(http.StatusBadRequest)
		writer.Write([]byte(`{"error": "ClientID must be a valid uuid"}`))
		return
	}
	if syncReq.LastSeenServerVersion < -1 {
		writer.WriteHeader(http.StatusBadRequest)
		writer.Write([]byte(`{"error": "LastSeenServerVersion cannot be less than -1"}`))
		return
	}
	if syncReq.Operations == nil {
		writer.WriteHeader(http.StatusBadRequest)
		writer.Write([]byte(`{"error": "Operations cannot be omitted"}`))
		return
	}

	// Validate request integrity
	if err := sync_engine.ValidateSyncRequestIntegrity(syncReq); err != nil {
		writer.WriteHeader(http.StatusBadRequest)
		writer.Write([]byte(`{"error": "Request integrity check failed"}`))
		return
	}

	syncResp, err := server.SyncService.Sync(request.Context(), syncReq)
	if err != nil {
		log.Printf("Sync request failed for client %s: %v", syncReq.ClientID, err)

		// Check if this is a SyncError with a code
		if syncErr, ok := err.(*sync_engine.SyncError); ok {
			// Return structured error with code
			errorBody, _ := json.Marshal(syncErr)
			writer.WriteHeader(http.StatusInternalServerError)
			writer.Write(errorBody)
			return
		}

		// Fallback for non-SyncError errors
		fallbackErr := sync_engine.NewSyncError(sync_engine.ErrDatabaseError, err.Error())
		errorBody, _ := json.Marshal(fallbackErr)
		writer.WriteHeader(http.StatusInternalServerError)
		writer.Write(errorBody)
		return
	}
	if syncResp == nil {
		syncErr := sync_engine.NewSyncError(sync_engine.ErrDatabaseError, "sync response is nil")
		errorBody, _ := json.Marshal(syncErr)
		writer.WriteHeader(http.StatusInternalServerError)
		writer.Write(errorBody)
		return
	}

	respBody, err := json.Marshal(syncResp)
	if err != nil {
		syncErr := sync_engine.NewSyncError(sync_engine.ErrDatabaseError, "failed to encode response")
		errorBody, _ := json.Marshal(syncErr)
		writer.WriteHeader(http.StatusInternalServerError)
		writer.Write(errorBody)
		return
	}

	writer.WriteHeader(http.StatusOK)
	writer.Write(respBody)
}

// ------------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------------

func Cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Access-Control-Allow-Origin", "*")
		writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(writer, request)
	})

}

// limitConcurrency limits all requests across all routes
func limitConcurrency(next http.HandlerFunc, maxConcurrentConnections int) http.HandlerFunc {
	semaphore := make(chan struct{}, maxConcurrentConnections)

	return func(w http.ResponseWriter, r *http.Request) {
		select {
		case semaphore <- struct{}{}:
			defer func() { <-semaphore }()
			next(w, r)
		default:
			http.Error(w, "Server too busy, try again later", http.StatusServiceUnavailable)
		}
	}
}
