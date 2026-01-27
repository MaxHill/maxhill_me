package sync_engine

import (
	"context"
	"fmt"

	"sync/internal/database"
)

// Receive Sync Request
// Validate request integrity
// Start transaction
//		Write operations to database
//		Get operations from the database starting from request.ClientLastSeenVersion
// Commit transaction
//		Reduce opertions that's been written to the database to a list of dots
// 		Find largest server version from the "new operations" that will be returned
//		Hash Response
//		Build and return SyncResponse

// What's needed:
//	SyncRequest type
//		hashRequest() string
//  SyncResponse type
//		hashResponse() string
//
// queries.getOperationsFrom(serverVersion)
// queries.getOperationsFrom(serverVersion)

type SyncService struct {
	db database.Service
}

func NewSyncService(db database.Service) *SyncService {
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
		return nil, fmt.Errorf("failed to begin gransaction: %w", err)
	}
	defer tx.Rollback()

	// _queries := sync_service.db.Queries().WithTx(tx)

	panic("Testing")
}
