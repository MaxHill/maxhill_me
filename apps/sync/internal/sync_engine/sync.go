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
	sort.Slice(req.Operations, func(i, j int) bool {
		return req.Operations[i].Version < req.Operations[j].Version
	})

	// 2. Insert each entry and get the auto-assigned ServerVersion
	for i, entry := range req.Operations {
		var valueStr sql.NullString
		// For clear operations, value should always be NULL (not the JSON literal "null")
		if entry.Value != nil && entry.Operation != "clear" {
			valueStr = sql.NullString{String: string(entry.Value), Valid: true}
		}

		var valueKeyStr sql.NullString
		if entry.ValueKey != nil {
			valueKeyStr = sql.NullString{String: string(entry.ValueKey), Valid: true}
		}

		serverVersion, err := queries.InsertWALOperation(ctx, repository.InsertWALOperationParams{
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
		req.Operations[i].ServerVersion = serverVersion
	}

	// 3. Get operations for client since their last seen ServerVersion
	dbOperations, err := queries.GetOperationsSinceServerVersion(ctx, repository.GetOperationsSinceServerVersionParams{
		ServerVersion: req.ClientLastSeenVersion,
		ClientID:      req.ClientID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get operations since server version: %w", err)
	}

	// 4. Convert database operations to response format
	newOperations := make([]WALOperation, len(dbOperations))
	for i, dbOperation := range dbOperations {
		var value json.RawMessage
		if dbOperation.Value.Valid {
			value = json.RawMessage(dbOperation.Value.String)
		}

		var valueKey json.RawMessage
		if dbOperation.ValueKey.Valid {
			valueKey = json.RawMessage(dbOperation.ValueKey.String)
		}

		newOperations[i] = WALOperation{
			Key:           dbOperation.Key,
			Table:         dbOperation.TableName,
			Operation:     dbOperation.Operation,
			Value:         value,
			ValueKey:      valueKey,
			Version:       dbOperation.Version,
			ClientID:      dbOperation.ClientID,
			ServerVersion: dbOperation.ServerVersion,
		}
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	responseHash, err := HashSyncResponse(newOperations, req.ClientLastSeenVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to hash response: %w", err)
	}

	return &SyncResponse{
		Operations:        newOperations,
		FromServerVersion: req.ClientLastSeenVersion,
		ResponseHash:      responseHash,
	}, nil
}
