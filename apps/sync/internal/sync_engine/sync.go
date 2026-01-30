package sync_engine

import (
	"context"
	"database/sql"
	"fmt"
	"sync/internal/repository"
)

type SyncService struct {
	db *sql.DB
}

func NewSyncService(db *sql.DB) *SyncService {
	return &SyncService{
		db: db,
	}
}

func (sync_service *SyncService) Sync(ctx context.Context, req SyncRequest) (*SyncResponse, error) {
	// Hash and validate the request
	err := ValidateSyncRequestIntegrity(req)
	if err != nil {
		return nil, fmt.Errorf("request integrity check failed for client %s: %w", req.ClientID, err)
	}

	tx, err := sync_service.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Convert incoming operations to database format and insert them
	dbOperations := make([]*repository.DBCRDTOperation, len(req.Operations))
	for i, operation := range req.Operations {
		dbOperation, err := operation.toDatabaseOperation()
		if err != nil {
			return nil, fmt.Errorf("failed to convert operation %d to database format: %w", i, err)
		}
		dbOperations[i] = dbOperation
	}

	_, err = repository.InsertCRDTOperations(ctx, tx, dbOperations)
	if err != nil {
		return nil, fmt.Errorf("failed to insert the operations: %w", err)
	}

	// Build list of dots that were synced
	var syncedDots = make([]Dot, len(req.Operations))
	for i, operation := range req.Operations {
		syncedDots[i] = operation.Dot
	}

	// Get operations the client hasn't seen yet
	unseenDBOperations, err := repository.GetCRDTOperationsSince(ctx, tx, req.LastSeenServerVersion, 1000, req.ClientID)
	if err != nil {
		return nil, fmt.Errorf("failed to get unseen operations: %w", err)
	}

	// Convert database operations to API format
	unseenOperations := make([]CRDTOperation, len(unseenDBOperations))
	for i, dbOperation := range unseenDBOperations {
		op, err := fromDatabaseOperation(dbOperation)
		if err != nil {
			return nil, fmt.Errorf("failed to convert database operation %d to API format: %w", i, err)
		}
		unseenOperations[i] = op
	}

	// Find the highest server version
	maxServerVersion := req.LastSeenServerVersion
	for _, dbOperation := range unseenDBOperations {
		maxServerVersion = max(maxServerVersion, dbOperation.ServerVersion)
	}

	// TODO: Implement the sync logic:
	// 1. Insert incoming operations from req.Operations
	// 2. Query operations since req.LastSeenServerVersion
	// 3. Build and return SyncResponse
	// 4. Commit transaction

	response := SyncResponse{
		BaseServerVersion:   req.LastSeenServerVersion,
		LatestServerVersion: maxServerVersion,

		Operations:       unseenOperations,
		SyncedOperations: syncedDots,
		ResponseHash:     "",
	}

	// TODO: Hash the response
	responseHash, err := HashSyncResponse(response)
	if err != nil {
		return nil, fmt.Errorf("failed to hash response: %w", err)
	}
	response.ResponseHash = responseHash

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &response, nil
}
