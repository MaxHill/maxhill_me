package repository

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
)

// Schema contains all table definitions for the sync system.
// The crdt_operations table stores all CRDT operations received by the server.
const Schema = `
CREATE TABLE IF NOT EXISTS crdt_operations (
    -- server_version is the primary key for global ordering of all operations
    server_version INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Dot: composite key (client_id, version) uniquely identifies each operation
    client_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    
    -- CRDTOperation fields
    type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    row_key TEXT NOT NULL,
    field TEXT,
    value TEXT,  -- JSON stored as TEXT in SQLite
    context TEXT,  -- JSON stored as TEXT in SQLite
    
    -- Ensure each Dot is unique
    UNIQUE(client_id, version)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_table_row ON crdt_operations(table_name, row_key);
CREATE INDEX IF NOT EXISTS idx_type ON crdt_operations(type);
CREATE INDEX IF NOT EXISTS idx_client_version ON crdt_operations(client_id, version);
`

// DBCRDTOperation represents a CRDT operation in the database.
type DBCRDTOperation struct {
	ServerVersion int64
	ClientID      string
	Version       int64
	Type          string
	TableName     string
	RowKey        string
	Field         *string
	Value         *string // JSON stored as TEXT
	Context       *string // JSON stored as TEXT
}

// Execer is an interface that represents either *sql.DB or *sql.Tx.
// This allows functions to work with both direct DB connections and transactions.
type Execer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// InitSchema creates all tables if they don't exist.
func InitSchema(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, Schema)
	return err
}

// InsertCRDTOperation inserts a single CRDT operation and returns the auto-generated server_version.
// If the operation already exists (duplicate client_id, version), it verifies the operation is identical.
// If the existing operation differs, this indicates a consistency violation and returns an error.
// This makes the operation idempotent - safe to retry with the same data.
// Works with both *sql.DB and *sql.Tx via the Execer interface.
func InsertCRDTOperation(ctx context.Context, exec Execer, op *DBCRDTOperation) (int64, error) {
	const insertQuery = `
		INSERT INTO crdt_operations 
		(client_id, version, type, table_name, row_key, field, value, context)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING server_version
	`

	var serverVersion int64
	err := exec.QueryRowContext(ctx, insertQuery,
		op.ClientID,
		op.Version,
		op.Type,
		op.TableName,
		op.RowKey,
		op.Field,
		op.Value,
		op.Context,
	).Scan(&serverVersion)

	// If no error, we successfully inserted and got the server_version
	if err == nil {
		return serverVersion, nil
	}

	// Check if this is a UNIQUE constraint violation (duplicate operation)
	if isUniqueConstraintError(err) {
		return handleDuplicateOperation(ctx, exec, op)
	}

	// Some other error occurred
	return 0, err
}

// isUniqueConstraintError checks if the error is a UNIQUE constraint violation
func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := err.Error()
	return len(errMsg) >= 17 && errMsg[:17] == "UNIQUE constraint"
}

// handleDuplicateOperation verifies that a duplicate operation is identical to the existing one.
// Returns the existing server_version if identical, or an error if different (consistency violation).
func handleDuplicateOperation(ctx context.Context, exec Execer, op *DBCRDTOperation) (int64, error) {
	const selectQuery = `
		SELECT server_version, type, table_name, row_key, field, value, context
		FROM crdt_operations 
		WHERE client_id = ? AND version = ?
	`

	var existing DBCRDTOperation
	existing.ClientID = op.ClientID
	existing.Version = op.Version

	err := exec.QueryRowContext(ctx, selectQuery, op.ClientID, op.Version).Scan(
		&existing.ServerVersion,
		&existing.Type,
		&existing.TableName,
		&existing.RowKey,
		&existing.Field,
		&existing.Value,
		&existing.Context,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch existing operation for duplicate check: %w", err)
	}

	// Compare the operation data (excluding ServerVersion which is auto-generated)
	if !operationsEqual(op, &existing) {
		return 0, fmt.Errorf(
			"CRDT consistency violation: duplicate operation (client_id=%s, version=%d) with different data. "+
				"Existing: type=%s, table=%s, row=%s. Incoming: type=%s, table=%s, row=%s",
			op.ClientID, op.Version,
			existing.Type, existing.TableName, existing.RowKey,
			op.Type, op.TableName, op.RowKey,
		)
	}

	// Operation is identical - this is a valid retry, return existing server_version
	return existing.ServerVersion, nil
}

// operationsEqual checks if two operations have identical data (excluding ServerVersion).
// Uses deep equality for nullable fields.
func operationsEqual(a, b *DBCRDTOperation) bool {
	return a.ClientID == b.ClientID &&
		a.Version == b.Version &&
		a.Type == b.Type &&
		a.TableName == b.TableName &&
		a.RowKey == b.RowKey &&
		reflect.DeepEqual(a.Field, b.Field) &&
		reflect.DeepEqual(a.Value, b.Value) &&
		reflect.DeepEqual(a.Context, b.Context)
}

// nullableStringEqual compares two nullable strings for equality
func nullableStringEqual(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// InsertCRDTOperations batch inserts multiple CRDT operations and returns their server_versions.
// This is more efficient than calling InsertCRDTOperation multiple times.
func InsertCRDTOperations(ctx context.Context, exec Execer, ops []*DBCRDTOperation) ([]int64, error) {
	if len(ops) == 0 {
		return []int64{}, nil
	}

	serverVersions := make([]int64, 0, len(ops))

	for _, op := range ops {
		serverVersion, err := InsertCRDTOperation(ctx, exec, op)
		if err != nil {
			return nil, err
		}
		serverVersions = append(serverVersions, serverVersion)
	}

	return serverVersions, nil
}

// GetCRDTOperationsSince retrieves all CRDT operations since a given server_version with a limit,
// excluding operations from the specified client.
// This is used by the sync endpoint to send operations that the client hasn't seen yet.
// Results are ordered by server_version ASC.
func GetCRDTOperationsSince(ctx context.Context, db Execer, serverVersion int64, limit int, excludeClientID string) ([]*DBCRDTOperation, error) {
	if excludeClientID == "" {
		return nil, fmt.Errorf("excludeClientID cannot be empty")
	}

	const query = `
		SELECT server_version, client_id, version, type, table_name, row_key, field, value, context
		FROM crdt_operations
		WHERE server_version > ? AND client_id != ?
		ORDER BY server_version ASC
		LIMIT ?
	`

	rows, err := db.QueryContext(ctx, query, serverVersion, excludeClientID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ops []*DBCRDTOperation
	for rows.Next() {
		op := &DBCRDTOperation{}
		err := rows.Scan(
			&op.ServerVersion,
			&op.ClientID,
			&op.Version,
			&op.Type,
			&op.TableName,
			&op.RowKey,
			&op.Field,
			&op.Value,
			&op.Context,
		)
		if err != nil {
			return nil, err
		}
		ops = append(ops, op)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return ops, nil
}

// GetMaxServerVersion returns the highest server_version in the database.
// Returns -1 if the table is empty (no operations yet).
// This is useful for detecting when a client's lastSeenServerVersion is out of sync
// with the server (e.g., after a server database reset).
func GetMaxServerVersion(ctx context.Context, db Execer) (int64, error) {
	const query = `
		SELECT COALESCE(MAX(server_version), -1)
		FROM crdt_operations
	`

	var maxVersion int64
	err := db.QueryRowContext(ctx, query).Scan(&maxVersion)
	if err != nil {
		return -1, fmt.Errorf("failed to get max server version: %w", err)
	}

	return maxVersion, nil
}
