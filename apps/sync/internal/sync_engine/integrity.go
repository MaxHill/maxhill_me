package sync_engine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
)

// ValidateSyncRequestIntegrity checks if the request hash matches the computed hash
func ValidateSyncRequestIntegrity(req SyncRequest) error {
	computedHash, err := HashSyncRequest(req)
	if err != nil {
		log.Printf("Failed to compute request hash for client %s: %v", req.ClientID, err)
		return fmt.Errorf("failed to compute request hash")
	}

	if computedHash != req.RequestHash {
		log.Printf("Request integrity check failed for client %s: hash mismatch", req.ClientID)
		return fmt.Errorf("request integrity check failed")
	}

	return nil
}

// HashSyncRequest computes a SHA-256 hash of the sync request for integrity verification
func HashSyncRequest(req SyncRequest) (string, error) {
	parts := []string{
		req.ClientID,
		fmt.Sprintf("%d", req.LastSeenServerVersion),
	}

	for _, op := range req.Operations {
		value := "null"
		valueKey := "null"

		if op.Type == "set" || op.Type == "setRow" {
			if op.Value != nil {
				b, err := json.Marshal(op.Value)
				if err != nil {
					return "", err
				}
				value = string(b)
			}
		}

		if op.Type == "set" && op.Field != nil {
			valueKey = *op.Field
		}

		parts = append(parts,
			op.RowKey,
			op.Table,
			op.Type,
			value,
			valueKey,
			fmt.Sprintf("%d", op.Dot.Version),
			op.Dot.ClientID,
		)
	}

	combined := strings.Join(parts, "|")
	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:]), nil
}

// HashSyncResponse computes a SHA-256 hash of the sync response for integrity verification
func HashSyncResponse(resp SyncResponse) (string, error) {
	parts := []string{
		fmt.Sprintf("%d", resp.BaseServerVersion),
		fmt.Sprintf("%d", resp.LatestServerVersion),
	}

	// Operations
	for _, op := range resp.Operations {
		parts = append(parts,
			op.Type,
			op.Table,
			op.RowKey,
			op.Dot.ClientID,
			fmt.Sprintf("%d", op.Dot.Version),
		)
	}

	// Synced operations
	for _, dot := range resp.SyncedOperations {
		parts = append(parts,
			dot.ClientID,
			fmt.Sprintf("%d", dot.Version),
		)
	}

	// Join with |
	combined := strings.Join(parts, "|")

	// SHA256
	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:]), nil
}
