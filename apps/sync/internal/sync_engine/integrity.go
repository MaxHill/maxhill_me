package sync_engine

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
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
		fmt.Sprintf("%d", req.ClientLastSeenVersion),
	}

	for _, entry := range req.Operations {
		value := "null"
		if entry.Value != nil {
			value = string(entry.Value)
		}
		valueKey := "null"
		if entry.ValueKey != nil {
			valueKey = string(entry.ValueKey)
		}

		parts = append(parts,
			entry.Key,
			entry.Table,
			entry.Operation,
			value,
			valueKey,
			fmt.Sprintf("%d", entry.Version),
			entry.ClientID,
		)
	}

	combined := parts[0]
	for i := 1; i < len(parts); i++ {
		combined += "|" + parts[i]
	}

	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:]), nil
}

// HashSyncResponse computes a SHA-256 hash of the sync response for integrity verification
func HashSyncResponse(entries []WALOperation, fromServerVersion int64) (string, error) {
	parts := []string{
		fmt.Sprintf("%d", fromServerVersion),
	}

	for _, entry := range entries {
		value := "null"
		if entry.Value != nil {
			value = string(entry.Value)
		}
		valueKey := "null"
		if entry.ValueKey != nil {
			valueKey = string(entry.ValueKey)
		}

		parts = append(parts,
			entry.Key,
			entry.Table,
			entry.Operation,
			value,
			valueKey,
			fmt.Sprintf("%d", entry.Version),
			entry.ClientID,
			fmt.Sprintf("%d", entry.ServerVersion),
		)
	}

	combined := parts[0]
	for i := 1; i < len(parts); i++ {
		combined += "|" + parts[i]
	}

	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:]), nil
}
