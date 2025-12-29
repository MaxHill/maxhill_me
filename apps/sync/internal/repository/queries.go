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

//go:embed queries/insert_wal_entry.sql
var insertWALEntrySQL string

//go:embed queries/get_entries_since_server_version.sql
var getEntriesSinceServerVersionSQL string

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

// InsertWALEntryParams contains parameters for inserting a WAL entry.
type InsertWALEntryParams struct {
	Key       string
	TableName string
	Operation string
	Value     sql.NullString
	ValueKey  sql.NullString
	Version   int64
	ClientID  string
}

// InsertWALEntry inserts a WAL entry and returns the auto-generated server version.
func (q *Queries) InsertWALEntry(ctx context.Context, arg InsertWALEntryParams) (int64, error) {
	row := q.db.QueryRowContext(ctx, insertWALEntrySQL,
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

// GetEntriesSinceServerVersionParams contains parameters for querying WAL entries.
type GetEntriesSinceServerVersionParams struct {
	ServerVersion int64
	ClientID      string
}

// GetEntriesSinceServerVersion retrieves all WAL entries since a given server version,
// excluding entries from the specified client.
func (q *Queries) GetEntriesSinceServerVersion(ctx context.Context, arg GetEntriesSinceServerVersionParams) ([]WalEntry, error) {
	rows, err := q.db.QueryContext(ctx, getEntriesSinceServerVersionSQL, arg.ServerVersion, arg.ClientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []WalEntry
	for rows.Next() {
		var i WalEntry
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
