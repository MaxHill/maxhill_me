package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/internal/sync_engine"
	"testing"
)

func FuzzServerHandleSync(f *testing.F) {
	// todo fuzz the things
}

func TestServer_handleSync(t *testing.T) {
	s := &Server{
		SyncService: &MockSyncService{
			errorType: ErrorTypeNone,
		},
	}

	tests := []struct {
		name           string
		requestBody    string
		expectedStatus int
		checkResponse  bool
	}{
		{
			name: "Happy path - empty entries",
			requestBody: `{
				"clientId": "550e8400-e29b-41d4-a716-446655440000",
				"entries": [],
				"clientLastSeenVersion": 0
			}`,
			expectedStatus: http.StatusOK,
			checkResponse:  true,
		},
		{
			name: "Happy path - with entries",
			requestBody: `{
				"clientId": "550e8400-e29b-41d4-a716-446655440000",
				"entries": [
					{
						"key": "test-key",
						"table": "test-table",
						"operation": "put",
						"value": {"data": "test"},
						"version": 1,
						"clientId": "550e8400-e29b-41d4-a716-446655440000",
						"serverVersion": 0
					}
				],
				"clientLastSeenVersion": 0
			}`,
			expectedStatus: http.StatusOK,
			checkResponse:  true,
		},
		{
			name:           "Invalid JSON",
			requestBody:    `{invalid json}`,
			expectedStatus: http.StatusBadRequest,
			checkResponse:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a request with the test body
			req := httptest.NewRequest(http.MethodPost, "/sync", bytes.NewBufferString(tt.requestBody))
			req.Header.Set("Content-Type", "application/json")

			// Create a response recorder to capture the response
			recorder := httptest.NewRecorder()

			// Call the handler directly
			s.handleSync(recorder, req)

			// Check status code
			if recorder.Code != tt.expectedStatus {
				t.Errorf("expected status %v; got %v", tt.expectedStatus, recorder.Code)
			}

			// Check response body if needed
			if tt.checkResponse && recorder.Code == http.StatusOK {
				var resp sync_engine.SyncResponse
				if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
					t.Errorf("failed to unmarshal response: %v", err)
				}

				// Verify response structure
				if resp.Entries == nil {
					t.Error("expected entries field in response, got nil")
				}
			}
		})
	}
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
