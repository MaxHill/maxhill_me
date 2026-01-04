package sync_engine

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"

	"sync/internal/database"
	"sync/internal/repository"
)

type SyncService struct {
	db database.Service
}

func NewSyncService(db database.Service) *SyncService {
	return &SyncService{
		db: db,
	}
}

func (s *SyncService) Sync(ctx context.Context, req SyncRequest) (*SyncResponse, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	queries := s.db.Queries().WithTx(tx)

	// 1. Sort client entries by their logical version (causal ordering)
	sort.Slice(req.Entries, func(i, j int) bool {
		return req.Entries[i].Version < req.Entries[j].Version
	})

	// 2. Insert each entry and get the auto-assigned ServerVersion
	for i, entry := range req.Entries {
		var valueStr sql.NullString
		if entry.Value != nil {
			valueStr = sql.NullString{String: string(entry.Value), Valid: true}
		}

		var valueKeyStr sql.NullString
		if entry.ValueKey != nil {
			valueKeyStr = sql.NullString{String: string(entry.ValueKey), Valid: true}
		}

		serverVersion, err := queries.InsertWALEntry(ctx, repository.InsertWALEntryParams{
			Key:       entry.Key,
			TableName: entry.Table,
			Operation: entry.Operation,
			Value:     valueStr,
			ValueKey:  valueKeyStr,
			Version:   entry.Version,
			ClientID:  entry.ClientID,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to insert WAL entry: %w", err)
		}

		// Update the entry with the server-assigned version
		req.Entries[i].ServerVersion = serverVersion
	}

	// 3. Get entries for client since their last seen ServerVersion
	dbEntries, err := queries.GetEntriesSinceServerVersion(ctx, repository.GetEntriesSinceServerVersionParams{
		ServerVersion: req.ClientLastSeenVersion,
		ClientID:      req.ClientID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get entries since server version: %w", err)
	}

	// 4. Convert database entries to response format
	newEntries := make([]WALEntry, len(dbEntries))
	for i, dbEntry := range dbEntries {
		var value json.RawMessage
		if dbEntry.Value.Valid {
			value = json.RawMessage(dbEntry.Value.String)
		}

		var valueKey json.RawMessage
		if dbEntry.ValueKey.Valid {
			valueKey = json.RawMessage(dbEntry.ValueKey.String)
		}

		newEntries[i] = WALEntry{
			Key:           dbEntry.Key,
			Table:         dbEntry.TableName,
			Operation:     dbEntry.Operation,
			Value:         value,
			ValueKey:      valueKey,
			Version:       dbEntry.Version,
			ClientID:      dbEntry.ClientID,
			ServerVersion: dbEntry.ServerVersion,
		}
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	responseHash, err := HashSyncResponse(newEntries, req.ClientLastSeenVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to hash response: %w", err)
	}

	return &SyncResponse{
		Entries:           newEntries,
		FromServerVersion: req.ClientLastSeenVersion,
		ResponseHash:      responseHash,
	}, nil
}
