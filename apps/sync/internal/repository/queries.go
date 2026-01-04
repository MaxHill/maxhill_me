package repository

import (
	"context"
	"database/sql"
	_ "embed"
)

//go:embed schema.sql
var schemaSQL string

//go:embed queries/init_server_version.sql
var initServerVersionSQL string

//go:embed queries/insert_wal_operation.sql
var insertWALOperationSQL string

//go:embed queries/get_operations_since_server_version.sql
var getOperationsSinceServerVersionSQL string

// InitSchema creates tables if they don't exist.
func (q *Queries) InitSchema(ctx context.Context) error {
	_, err := q.db.ExecContext(ctx, schemaSQL)
	return err
}

// InitializeServerVersion inserts the initial server version if it doesn't exist.
func (q *Queries) InitializeServerVersion(ctx context.Context) error {
	_, err := q.db.ExecContext(ctx, initServerVersionSQL)
	return err
}

// InsertWALOperationParams contains parameters for inserting a WAL operation.
type InsertWALOperationParams struct {
	Key       string
	TableName string
	Operation string
	Value     sql.NullString
	ValueKey  sql.NullString
	Version   int64
	ClientID  string
}

// InsertWALOperation inserts a WAL operation and returns the auto-generated server version.
func (q *Queries) InsertWALOperation(ctx context.Context, arg InsertWALOperationParams) (int64, error) {
	row := q.db.QueryRowContext(ctx, insertWALOperationSQL,
		arg.Key,
		arg.TableName,
		arg.Operation,
		arg.Value,
		arg.ValueKey,
		arg.Version,
		arg.ClientID,
	)
	var serverVersion int64
	err := row.Scan(&serverVersion)
	return serverVersion, err
}

// GetOperationsSinceServerVersionParams contains parameters for querying WAL operations.
type GetOperationsSinceServerVersionParams struct {
	ServerVersion int64
	ClientID      string
}

// GetOperationsSinceServerVersion retrieves all WAL operations since a given server version,
// excluding operations from the specified client.
func (q *Queries) GetOperationsSinceServerVersion(ctx context.Context, arg GetOperationsSinceServerVersionParams) ([]WalOperation, error) {
	rows, err := q.db.QueryContext(ctx, getOperationsSinceServerVersionSQL, arg.ServerVersion, arg.ClientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []WalOperation
	for rows.Next() {
		var i WalOperation
		if err := rows.Scan(
			&i.ServerVersion,
			&i.Key,
			&i.TableName,
			&i.Operation,
			&i.Value,
			&i.ValueKey,
			&i.Version,
			&i.ClientID,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}

	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return items, nil
}
