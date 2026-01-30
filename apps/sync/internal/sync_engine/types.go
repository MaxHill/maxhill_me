package sync_engine

import (
	"context"
	"encoding/json"
	"fmt"
	"sync/internal/repository"
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

func (op *CRDTOperation) toDatabaseOperation() (*repository.DBCRDTOperation, error) {
	valueStr, err := jsonRawMessageToString(op.Value)
	if err != nil {
		return nil, fmt.Errorf("failed to convert value for operation (clientID=%s, version=%d, type=%s, table=%s, rowKey=%s): %w",
			op.Dot.ClientID, op.Dot.Version, op.Type, op.Table, op.RowKey, err)
	}

	contextStr, err := mapToJSONString(op.Context)
	if err != nil {
		return nil, fmt.Errorf("failed to convert context for operation (clientID=%s, version=%d, type=%s, table=%s, rowKey=%s): %w",
			op.Dot.ClientID, op.Dot.Version, op.Type, op.Table, op.RowKey, err)
	}

	return &repository.DBCRDTOperation{
		ServerVersion: 0, // Set by DB AUTOINCREMENT
		ClientID:      op.Dot.ClientID,
		Version:       op.Dot.Version,
		Type:          op.Type,
		TableName:     op.Table,
		RowKey:        op.RowKey,
		Field:         op.Field,
		Value:         valueStr,
		Context:       contextStr,
	}, nil
}

func fromDatabaseOperation(dbOperation *repository.DBCRDTOperation) (CRDTOperation, error) {
	value, err := stringToJSONRawMessage(dbOperation.Value)
	if err != nil {
		return CRDTOperation{}, fmt.Errorf("failed to convert value for operation (serverVersion=%d, clientID=%s, version=%d, type=%s, table=%s, rowKey=%s): %w",
			dbOperation.ServerVersion, dbOperation.ClientID, dbOperation.Version, dbOperation.Type, dbOperation.TableName, dbOperation.RowKey, err)
	}

	context, err := jsonStringToMap(dbOperation.Context)
	if err != nil {
		return CRDTOperation{}, fmt.Errorf("failed to convert context for operation (serverVersion=%d, clientID=%s, version=%d, type=%s, table=%s, rowKey=%s): %w",
			dbOperation.ServerVersion, dbOperation.ClientID, dbOperation.Version, dbOperation.Type, dbOperation.TableName, dbOperation.RowKey, err)
	}

	return CRDTOperation{
		Type:    dbOperation.Type,
		Table:   dbOperation.TableName,
		RowKey:  dbOperation.RowKey,
		Field:   dbOperation.Field,
		Value:   value,
		Context: context,
		Dot: Dot{
			ClientID: dbOperation.ClientID,
			Version:  dbOperation.Version,
		},
	}, nil
}

type SyncServiceInterface interface {
	Sync(ctx context.Context, req SyncRequest) (*SyncResponse, error)
}

// jsonRawMessageToString converts json.RawMessage to *string for database storage.
// Returns nil if input is nil or empty.
func jsonRawMessageToString(raw json.RawMessage) (*string, error) {
	if raw == nil || len(raw) == 0 {
		return nil, nil
	}

	// Validate it's valid JSON
	if !json.Valid(raw) {
		return nil, fmt.Errorf("invalid JSON in RawMessage: %s", string(raw))
	}

	str := string(raw)
	return &str, nil
}

// stringToJSONRawMessage converts *string from database to json.RawMessage.
// Returns nil if input is nil.
func stringToJSONRawMessage(s *string) (json.RawMessage, error) {
	if s == nil {
		return nil, nil
	}

	// Validate it's valid JSON
	raw := json.RawMessage(*s)
	if !json.Valid(raw) {
		return nil, fmt.Errorf("invalid JSON in string: %s", *s)
	}

	return raw, nil
}

// mapToJSONString converts map[string]int64 to *string for database storage.
// Returns nil if input is nil. Empty maps are converted to "{}".
func mapToJSONString(m map[string]int64) (*string, error) {
	if m == nil {
		return nil, nil
	}

	bytes, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal map to JSON: %w", err)
	}

	str := string(bytes)
	return &str, nil
}

// jsonStringToMap converts *string from database to map[string]int64.
// Returns nil if input is nil.
func jsonStringToMap(s *string) (map[string]int64, error) {
	if s == nil {
		return nil, nil
	}

	var m map[string]int64
	if err := json.Unmarshal([]byte(*s), &m); err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON to map (value: %s): %w", *s, err)
	}

	return m, nil
}
