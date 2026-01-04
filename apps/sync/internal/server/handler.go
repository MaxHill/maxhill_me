package server

import (
	"encoding/json"
	"io"
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
	if syncReq.ClientLastSeenVersion < -1 {
		writer.WriteHeader(http.StatusBadRequest)
		writer.Write([]byte(`{"error": "ClientLastSeenVersion cannot be less than -1"}`))
		return
	}
	if syncReq.Entries == nil {
		writer.WriteHeader(http.StatusBadRequest)
		writer.Write([]byte(`{"error": "Entries cannot be omitted"}`))
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
		writer.WriteHeader(http.StatusInternalServerError)
		writer.Write([]byte(`{"error": "Error when syncing request"}`))
		return
	}
	if syncResp == nil {
		writer.WriteHeader(http.StatusInternalServerError)
		writer.Write([]byte(`{"error": "Error when syncing request"}`))
		return
	}

	respBody, err := json.Marshal(syncResp)
	if err != nil {
		writer.WriteHeader(http.StatusInternalServerError)
		writer.Write([]byte(`{"error": "Failed to encode response"}`))
		return
	}

	writer.WriteHeader(http.StatusOK)
	writer.Write(respBody)
}

// ------------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------------

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
