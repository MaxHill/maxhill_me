package sync_engine

import (
	"context"
	"encoding/json"
)

type Dot struct {
	ClientID string `json:"clientId"`
	Version  int64  `json:"version"`
}

type CRDTOperation struct {
	Type    string           `json:"type"`
	Table   string           `json:"table"`
	RowKey  string           `json:"rowKey"`
	Field   *string          `json:"field,omitempty"`
	Value   json.RawMessage  `json:"value,omitempty"`   // Only for set and setRow operations
	Context map[string]int64 `json:"context,omitempty"` // Only for remove operation
	Dot     Dot              `json:"dot"`
}

type SyncRequest struct {
	ClientID              string          `json:"clientId"`
	Operations            []CRDTOperation `json:"operations"`
	LastSeenServerVersion int64           `json:"lastSeenServerVersion"` // Last ServerVersion client saw
	RequestHash           string          `json:"requestHash"`
}

type SyncResponse struct {
	BaseServerVersion   int64 `json:"baseServerVersion"`
	LatestServerVersion int64 `json:"latestServerVersion"`

	Operations       []CRDTOperation `json:"operations"`
	SyncedOperations []Dot           `json:"syncedOperations"`

	ResponseHash string `json:"responseHash"`
}

type SyncServiceInterface interface {
	Sync(ctx context.Context, req SyncRequest) (*SyncResponse, error)
}
