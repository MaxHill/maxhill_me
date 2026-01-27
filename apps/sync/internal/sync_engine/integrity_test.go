package sync_engine

import (
	"encoding/json"
	"testing"
)

// -------------------- SyncRequest tests --------------------

func TestHashSyncRequest(t *testing.T) {
	tests := []struct {
		name    string
		request SyncRequest
		wantErr bool
	}{
		{
			name: "empty request",
			request: SyncRequest{
				ClientID:              "test-client",
				LastSeenServerVersion: -1,
				Operations:            []CRDTOperation{},
			},
			wantErr: false,
		},
		{
			name: "single set operation",
			request: SyncRequest{
				ClientID:              "test-client",
				LastSeenServerVersion: 0,
				Operations: []CRDTOperation{
					{
						Type:   "set",
						Table:  "users",
						RowKey: "42",
						Field:  stringPtr("name"),
						Value:  json.RawMessage(`"Alice"`),
						Dot:    Dot{ClientID: "test-client", Version: 1},
					},
				},
			},
			wantErr: false,
		},
		{
			name: "multiple operations",
			request: SyncRequest{
				ClientID:              "client-abc",
				LastSeenServerVersion: 5,
				Operations: []CRDTOperation{
					{
						Type:   "set",
						Table:  "posts",
						RowKey: "p1",
						Field:  stringPtr("title"),
						Value:  json.RawMessage(`"Hello"`),
						Dot:    Dot{ClientID: "client-abc", Version: 6},
					},
					{
						Type:   "remove",
						Table:  "posts",
						RowKey: "p2",
						Dot:    Dot{ClientID: "client-abc", Version: 7},
						Context: map[string]int64{
							"client-abc": 7,
						},
					},
				},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash, err := HashSyncRequest(tt.request)
			if (err != nil) != tt.wantErr {
				t.Errorf("HashSyncRequest() error = %v, wantErr %v", err, tt.wantErr)
			}
			if hash == "" {
				t.Errorf("HashSyncRequest() returned empty hash")
			}

			// Deterministic check: multiple runs produce same hash
			hash2, _ := HashSyncRequest(tt.request)
			if hash != hash2 {
				t.Errorf("HashSyncRequest() not deterministic: got %v and %v", hash, hash2)
			}
		})
	}
}

// -------------------- SyncResponse tests --------------------

func TestHashSyncResponse(t *testing.T) {
	tests := []struct {
		name    string
		resp    SyncResponse
		wantErr bool
	}{
		{
			name: "empty response",
			resp: SyncResponse{
				BaseServerVersion:   -1,
				LatestServerVersion: -1,
				Operations:          []CRDTOperation{},
				SyncedOperations:    []Dot{},
			},
			wantErr: false,
		},
		{
			name: "response with operations and synced operations",
			resp: SyncResponse{
				BaseServerVersion:   0,
				LatestServerVersion: 2,
				Operations: []CRDTOperation{
					{
						Type:   "set",
						Table:  "users",
						RowKey: "42",
						Field:  stringPtr("name"),
						Value:  json.RawMessage(`"Alice"`),
						Dot:    Dot{ClientID: "client-1", Version: 1},
					},
					{
						Type:   "setRow",
						Table:  "posts",
						RowKey: "p1",
						Value:  json.RawMessage(`{"title":"Hello"}`),
						Dot:    Dot{ClientID: "client-2", Version: 2},
					},
				},
				SyncedOperations: []Dot{
					{ClientID: "client-1", Version: 1},
					{ClientID: "client-2", Version: 2},
				},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash, err := HashSyncResponse(tt.resp)
			if (err != nil) != tt.wantErr {
				t.Errorf("HashSyncResponse() error = %v, wantErr %v", err, tt.wantErr)
			}
			if hash == "" {
				t.Errorf("HashSyncResponse() returned empty hash")
			}

			hash2, _ := HashSyncResponse(tt.resp)
			if hash != hash2 {
				t.Errorf("HashSyncResponse() not deterministic: got %v and %v", hash, hash2)
			}
		})
	}
}

// -------------------- SyncRequest integrity test --------------------

func TestValidateSyncRequestIntegrity(t *testing.T) {
	req := SyncRequest{
		ClientID:              "test-client",
		LastSeenServerVersion: 0,
		Operations:            []CRDTOperation{},
	}

	validHash, _ := HashSyncRequest(req)
	req.RequestHash = validHash

	t.Run("valid hash", func(t *testing.T) {
		err := ValidateSyncRequestIntegrity(req)
		if err != nil {
			t.Errorf("ValidateSyncRequestIntegrity() failed: %v", err)
		}
	})

	t.Run("invalid hash", func(t *testing.T) {
		req.RequestHash = "invalid-hash"
		err := ValidateSyncRequestIntegrity(req)
		if err == nil {
			t.Errorf("Expected error for invalid hash, got nil")
		}
	})
}

// -------------------- helper --------------------
func stringPtr(s string) *string { return &s }
