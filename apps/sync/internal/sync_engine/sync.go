package sync_engine

import (
	"context"
	"database/sql"
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
		return nil, NewSyncErrorf(ErrRequestIntegrity, "request integrity check failed for client %s: %v", req.ClientID, err)
	}

	tx, err := sync_service.db.Begin()
	if err != nil {
		return nil, NewSyncErrorf(ErrDatabaseError, "failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	// Convert incoming operations to database format and insert them
	dbOperations := make([]*repository.DBCRDTOperation, len(req.Operations))
	for i, operation := range req.Operations {
		dbOperation, err := operation.toDatabaseOperation()
		if err != nil {
			return nil, NewSyncErrorf(ErrInvalidOperation, "failed to convert operation %d to database format: %v", i, err)
		}
		dbOperations[i] = dbOperation
	}

	serverVersions, err := repository.InsertCRDTOperations(ctx, tx, dbOperations)
	if err != nil {
		return nil, NewSyncErrorf(ErrDatabaseError, "failed to insert the operations: %v", err)
	}

	// Check if client's lastSeenServerVersion is out of sync with the server
	// This can happen if the server database was reset but clients still have old state
	actualMaxServerVersion, err := repository.GetMaxServerVersion(ctx, tx)
	if err != nil {
		return nil, NewSyncErrorf(ErrDatabaseError, "failed to get max server version: %v", err)
	}

	// If client claims to have seen operations beyond what exists in the database,
	// the client is out of sync and needs to reset its state.
	// This typically happens when the server database is reset/cleared.
	if req.LastSeenServerVersion > actualMaxServerVersion {
		return nil, NewSyncErrorf(ErrClientStateOutOfSync,
			"client lastSeenServerVersion=%d but server max is %d",
			req.LastSeenServerVersion, actualMaxServerVersion)
	}

	// Build list of dots that were synced
	var syncedDots = make([]Dot, len(req.Operations))
	for i, operation := range req.Operations {
		syncedDots[i] = operation.Dot
	}

	// Get operations the client hasn't seen yet
	unseenDBOperations, err := repository.GetCRDTOperationsSince(ctx, tx, req.LastSeenServerVersion, 1000, req.ClientID)
	if err != nil {
		return nil, NewSyncErrorf(ErrDatabaseError, "failed to get unseen operations: %v", err)
	}

	// Convert database operations to API format
	unseenOperations := make([]CRDTOperation, len(unseenDBOperations))
	for i, dbOperation := range unseenDBOperations {
		op, err := fromDatabaseOperation(dbOperation)
		if err != nil {
			return nil, NewSyncErrorf(ErrInvalidOperation, "failed to convert database operation %d to API format: %v", i, err)
		}
		unseenOperations[i] = op
	}

	// Find the highest server version
	// Start with the client's last seen version
	maxServerVersion := req.LastSeenServerVersion

	// Include newly inserted operations
	for _, serverVersion := range serverVersions {
		maxServerVersion = max(maxServerVersion, serverVersion)
	}

	// Include operations being returned to the client
	for _, dbOperation := range unseenDBOperations {
		maxServerVersion = max(maxServerVersion, dbOperation.ServerVersion)
	}

	response := SyncResponse{
		BaseServerVersion:   req.LastSeenServerVersion,
		LatestServerVersion: maxServerVersion,

		Operations:       unseenOperations,
		SyncedOperations: syncedDots,
		ResponseHash:     "",
	}

	responseHash, err := HashSyncResponse(response)
	if err != nil {
		return nil, NewSyncErrorf(ErrResponseIntegrity, "failed to hash response: %v", err)
	}
	response.ResponseHash = responseHash

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return nil, NewSyncErrorf(ErrDatabaseError, "failed to commit transaction: %v", err)
	}

	return &response, nil
}
