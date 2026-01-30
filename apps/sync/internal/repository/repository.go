package repository

import (
	"context"
	"database/sql"
	"fmt"
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
// Works with both *sql.DB and *sql.Tx via the Execer interface.
func InsertCRDTOperation(ctx context.Context, exec Execer, op *DBCRDTOperation) (int64, error) {
	const query = `
		INSERT INTO crdt_operations 
		(client_id, version, type, table_name, row_key, field, value, context)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING server_version
	`

	var serverVersion int64
	err := exec.QueryRowContext(ctx, query,
		op.ClientID,
		op.Version,
		op.Type,
		op.TableName,
		op.RowKey,
		op.Field,
		op.Value,
		op.Context,
	).Scan(&serverVersion)

	return serverVersion, err
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
