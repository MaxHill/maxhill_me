package sync_engine

import (
	"context"
	"encoding/json"
)

type WALOperation struct {
	Key           string          `json:"key"`
	Table         string          `json:"table"`
	Operation     string          `json:"operation"` // "put" | "del"
	Value         json.RawMessage `json:"value,omitempty"`
	ValueKey      json.RawMessage `json:"valueKey,omitempty"`
	Version       int64           `json:"version"` // Client's logical timestamp
	ClientID      string          `json:"clientId"`
	ServerVersion int64           `json:"serverVersion"` // Auto-incrementing sync marker
}

type SyncRequest struct {
	ClientID              string         `json:"clientId"`
	Operations            []WALOperation `json:"operations"`
	ClientLastSeenVersion int64          `json:"clientLastSeenVersion"` // Last ServerVersion client saw
	RequestHash           string         `json:"requestHash"`
}

type SyncResponse struct {
	Operations        []WALOperation `json:"operations"`
	FromServerVersion int64          `json:"fromServerVersion"`
	ResponseHash      string         `json:"responseHash"`
}

type SyncServiceInterface interface {
	Sync(ctx context.Context, req SyncRequest) (*SyncResponse, error)
}
