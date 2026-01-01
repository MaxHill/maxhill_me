package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"sync/internal/server"
	"sync/internal/sync_engine"
	"testing"
)

func FuzzServerHandleSync(f *testing.F) {

	f.Add(int64(42), "550e8400-e29b-41d4-a716-446655440000", int64(0), 0)
	f.Add(int64(7), "", int64(0), 0)
	f.Add(int64(13), "not-a-uuid", int64(-1), 1)
	f.Add(int64(42), "550e8400-e29b-41d4-a716-446655440000", int64(999999), 100)

	f.Fuzz(func(t *testing.T, seed int64, clientID string, lastSeenVersion int64, numEntries int) {
		random := rand.New(rand.NewSource(seed))

		//  Create server
		errorType := randomErrorType(random)
		server := &server.Server{
			SyncService: &MockSyncService{
				errorType: errorType,
			},
		}

		// Bound numEntries to reasonable range
		if numEntries < 0 {
			numEntries = 0
		}
		if numEntries > 100 {
			numEntries = 100
		}

		// Build entries
		entries := make([]sync_engine.WALEntry, numEntries)
		for i := 0; i < numEntries; i++ {
			entries[i] = sync_engine.WALEntry{
				Key:       fmt.Sprintf("key-%d", i),
				Table:     "test-table",
				Operation: "put",
				Value:     json.RawMessage(`{"data": "test"}`),
				Version:   int64(i + 1),
				ClientID:  clientID,
			}
		}

		syncReq := sync_engine.SyncRequest{
			ClientID:              clientID,
			Entries:               entries,
			ClientLastSeenVersion: lastSeenVersion,
		}

		requestBody, _ := json.Marshal(syncReq)
		req := httptest.NewRequest(http.MethodPost, "/sync", bytes.NewBuffer(requestBody))
		req.Header.Set("Content-Type", "application/json")

		recorder := httptest.NewRecorder()

		// Handler should never panic
		defer func() {
			if r := recover(); r != nil {
				t.Errorf("handler panicked: %v", r)
			}
		}()

		server.HandleSync(recorder, req)

		if recorder.Code != 200 && recorder.Code != 400 && recorder.Code != 500 {
			t.Errorf("invalid status code: %d", recorder.Code)
		}

		if !json.Valid(recorder.Body.Bytes()) {
			t.Errorf("response is not valid JSON: %s", recorder.Body.String())
		}

		if recorder.Code == 200 {
			var resp sync_engine.SyncResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
				t.Errorf("200 response doesn't unmarshal: %v", err)
			}
		}

	})

}

//  ------------------------------------------------------------------------
//  Mocks
//  ------------------------------------------------------------------------

type ErrorType string

const (
	ErrorTypeNone        ErrorType = ""     // Success - return valid response
	ErrorTypeSyncError   ErrorType = "sync" // SyncService.Sync() returns error
	ErrorTypeInvalidJSON ErrorType = "json" // Return response that fails json.Marshal()
	ErrorTypeNilResponse ErrorType = "nil"  // Return nil response
)

func randomErrorType(random *rand.Rand) ErrorType {
	choice := random.Int() % 4
	switch choice {
	case 0:
		return ErrorTypeNone
	case 1:
		return ErrorTypeSyncError
	case 2:
		return ErrorTypeInvalidJSON
	case 3:
		return ErrorTypeNilResponse
	}

	return ErrorTypeNone
}

type MockSyncService struct {
	errorType ErrorType
}

func (m *MockSyncService) Sync(ctx context.Context, req sync_engine.SyncRequest) (*sync_engine.SyncResponse, error) {
	switch m.errorType {
	case ErrorTypeNone:
		return &sync_engine.SyncResponse{Entries: req.Entries}, nil

	case ErrorTypeSyncError:
		return nil, fmt.Errorf("mock sync error")

	case ErrorTypeInvalidJSON:
		entries := []sync_engine.WALEntry{
			{
				Key:       "test",
				Table:     "test",
				Operation: "put",
				Value:     json.RawMessage(`{invalid`), // Invalid JSON
				Version:   1,
				ClientID:  req.ClientID,
			},
		}
		return &sync_engine.SyncResponse{Entries: entries}, nil

	case ErrorTypeNilResponse:
		return nil, nil

	default:
		return &sync_engine.SyncResponse{Entries: req.Entries}, nil
	}
}
