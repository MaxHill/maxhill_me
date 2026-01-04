package sync_engine

import (
	"encoding/json"
	"testing"
)

func TestHashSyncRequest(t *testing.T) {
	tests := []struct {
		name    string
		request SyncRequest
		want    string
		wantErr bool
	}{
		{
			name: "empty request",
			request: SyncRequest{
				ClientID:              "test-client",
				ClientLastSeenVersion: -1,
				Entries:               []WALEntry{},
			},
			want:    "8c4ab6aba942a7f9e7b6e8f3e3f9c8b5d6f7e8a9b0c1d2e3f4a5b6c7d8e9f0a1", // Will compute actual
			wantErr: false,
		},
		{
			name: "request with one entry",
			request: SyncRequest{
				ClientID:              "test-client",
				ClientLastSeenVersion: 0,
				Entries: []WALEntry{
					{
						Key:       "key1",
						Table:     "users",
						Operation: "put",
						Value:     json.RawMessage(`{"id":1,"name":"test"}`),
						ValueKey:  nil,
						Version:   1,
						ClientID:  "test-client",
					},
				},
			},
			wantErr: false,
		},
		{
			name: "request with multiple entries",
			request: SyncRequest{
				ClientID:              "client-abc",
				ClientLastSeenVersion: 5,
				Entries: []WALEntry{
					{
						Key:       "key1",
						Table:     "posts",
						Operation: "put",
						Value:     json.RawMessage(`{"id":"post1"}`),
						Version:   6,
						ClientID:  "client-abc",
					},
					{
						Key:       "key2",
						Table:     "posts",
						Operation: "del",
						Value:     json.RawMessage(`"post1"`),
						Version:   7,
						ClientID:  "client-abc",
					},
				},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := HashSyncRequest(tt.request)
			if (err != nil) != tt.wantErr {
				t.Errorf("HashSyncRequest() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got == "" {
				t.Errorf("HashSyncRequest() returned empty hash")
			}
			// Verify hash is deterministic by computing twice
			got2, _ := HashSyncRequest(tt.request)
			if got != got2 {
				t.Errorf("HashSyncRequest() not deterministic: got %v and %v", got, got2)
			}
		})
	}
}

func TestHashSyncResponse(t *testing.T) {
	tests := []struct {
		name              string
		entries           []WALEntry
		fromServerVersion int64
		wantErr           bool
	}{
		{
			name:              "empty response",
			entries:           []WALEntry{},
			fromServerVersion: -1,
			wantErr:           false,
		},
		{
			name: "response with entries",
			entries: []WALEntry{
				{
					Key:           "key1",
					Table:         "users",
					Operation:     "put",
					Value:         json.RawMessage(`{"id":1}`),
					Version:       1,
					ClientID:      "client-1",
					ServerVersion: 0,
				},
				{
					Key:           "key2",
					Table:         "posts",
					Operation:     "put",
					Value:         json.RawMessage(`{"id":"post1"}`),
					Version:       2,
					ClientID:      "client-2",
					ServerVersion: 1,
				},
			},
			fromServerVersion: 0,
			wantErr:           false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := HashSyncResponse(tt.entries, tt.fromServerVersion)
			if (err != nil) != tt.wantErr {
				t.Errorf("HashSyncResponse() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got == "" {
				t.Errorf("HashSyncResponse() returned empty hash")
			}
			// Verify hash is deterministic
			got2, _ := HashSyncResponse(tt.entries, tt.fromServerVersion)
			if got != got2 {
				t.Errorf("HashSyncResponse() not deterministic: got %v and %v", got, got2)
			}
		})
	}
}

func TestValidateSyncRequestIntegrity(t *testing.T) {
	validRequest := SyncRequest{
		ClientID:              "test-client",
		ClientLastSeenVersion: 0,
		Entries:               []WALEntry{},
	}

	// Compute valid hash
	validHash, _ := HashSyncRequest(validRequest)
	validRequest.RequestHash = validHash

	tests := []struct {
		name    string
		request SyncRequest
		wantErr bool
	}{
		{
			name:    "valid request",
			request: validRequest,
			wantErr: false,
		},
		{
			name: "invalid hash",
			request: SyncRequest{
				ClientID:              "test-client",
				ClientLastSeenVersion: 0,
				Entries:               []WALEntry{},
				RequestHash:           "invalid-hash",
			},
			wantErr: true,
		},
		{
			name: "tampered data",
			request: SyncRequest{
				ClientID:              "different-client",
				ClientLastSeenVersion: 0,
				Entries:               []WALEntry{},
				RequestHash:           validHash, // Using hash from different data
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateSyncRequestIntegrity(tt.request)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateSyncRequestIntegrity() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestHashConsistency(t *testing.T) {
	// Test that the same data produces the same hash across multiple runs
	request := SyncRequest{
		ClientID:              "consistency-test",
		ClientLastSeenVersion: 10,
		Entries: []WALEntry{
			{
				Key:       "test-key",
				Table:     "test-table",
				Operation: "put",
				Value:     json.RawMessage(`{"test":"data"}`),
				Version:   11,
				ClientID:  "consistency-test",
			},
		},
	}

	hashes := make([]string, 10)
	for i := 0; i < 10; i++ {
		hash, err := HashSyncRequest(request)
		if err != nil {
			t.Fatalf("HashSyncRequest() failed: %v", err)
		}
		hashes[i] = hash
	}

	// All hashes should be identical
	firstHash := hashes[0]
	for i, hash := range hashes {
		if hash != firstHash {
			t.Errorf("Hash inconsistency at iteration %d: got %v, want %v", i, hash, firstHash)
		}
	}
}
