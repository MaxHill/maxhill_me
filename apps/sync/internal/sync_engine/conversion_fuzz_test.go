package sync_engine

import (
	"encoding/json"
	"reflect"
	"testing"
)

// FuzzCRDTOperationRoundtrip tests that converting a CRDTOperation to DB format
// and back results in an equivalent operation.
func FuzzCRDTOperationRoundtrip(f *testing.F) {
	// Seed corpus with interesting test cases
	f.Add("client1", int64(1), "set", "users", "user123", "name", `{"value":"John"}`, `{"client1":1,"client2":2}`)
	f.Add("client2", int64(100), "remove", "posts", "post456", "title", `null`, `{}`)
	f.Add("client3", int64(999), "setRow", "todos", "todo789", "", `{"done":true}`, ``)
	f.Add("", int64(0), "set", "", "", "", ``, ``)
	f.Add("unicode-client-🚀", int64(42), "set", "table", "key", "field", `{"emoji":"🎉"}`, `{"client":1}`)

	f.Fuzz(func(t *testing.T, clientID string, version int64, opType string, table string, rowKey string, field string, valueJSON string, contextJSON string) {
		// Build original operation
		var fieldPtr *string
		if field != "" {
			fieldPtr = &field
		}

		var value json.RawMessage
		if valueJSON != "" {
			// Only use valid JSON for value
			if !json.Valid([]byte(valueJSON)) {
				t.Skip("invalid JSON in value")
			}
			value = json.RawMessage(valueJSON)
		}

		var context map[string]int64
		if contextJSON != "" {
			// Only use valid JSON for context
			if !json.Valid([]byte(contextJSON)) {
				t.Skip("invalid JSON in context")
			}
			if err := json.Unmarshal([]byte(contextJSON), &context); err != nil {
				t.Skip("context JSON is not a map[string]int64")
			}
		}

		original := CRDTOperation{
			Type:    opType,
			Table:   table,
			RowKey:  rowKey,
			Field:   fieldPtr,
			Value:   value,
			Context: context,
			Dot: Dot{
				ClientID: clientID,
				Version:  version,
			},
		}

		// Convert to DB format and back
		dbOperation, err := original.toDatabaseOperation()
		if err != nil {
			t.Fatalf("toDatabaseOperation failed: %v", err)
		}

		roundtrip, err := fromDatabaseOperation(dbOperation)
		if err != nil {
			t.Fatalf("fromDatabaseOperation failed: %v", err)
		}

		// Compare using reflect.DeepEqual
		if !reflect.DeepEqual(original, roundtrip) {
			t.Errorf("roundtrip mismatch:\noriginal:  %+v\nroundtrip: %+v", original, roundtrip)
		}
	})
}
