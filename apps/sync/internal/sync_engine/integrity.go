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

	// Operations - include value, field, and context for integrity
	for _, op := range resp.Operations {
		parts = append(parts,
			op.Type,
			op.Table,
			op.RowKey,
			op.Dot.ClientID,
			fmt.Sprintf("%d", op.Dot.Version),
		)

		// Include operation-specific fields to match client hash logic
		if op.Type == "set" {
			// Add field (or "null" if not present)
			fieldValue := "null"
			if op.Field != nil {
				fieldValue = *op.Field
			}
			parts = append(parts, fieldValue)

			// Add value (or "null" if not present)
			if op.Value != nil {
				b, err := json.Marshal(op.Value)
				if err != nil {
					return "", err
				}
				parts = append(parts, string(b))
			} else {
				parts = append(parts, "null")
			}
		} else if op.Type == "setRow" {
			parts = append(parts, "null") // field placeholder for consistency

			// Add value (or "null" if not present)
			if op.Value != nil {
				b, err := json.Marshal(op.Value)
				if err != nil {
					return "", err
				}
				parts = append(parts, string(b))
			} else {
				parts = append(parts, "null")
			}
		} else if op.Type == "remove" {
			parts = append(parts, "null") // field placeholder
			parts = append(parts, "null") // value placeholder

			// Add context (sorted keys for deterministic hash)
			if op.Context != nil {
				// Sort context keys for deterministic ordering
				keys := make([]string, 0, len(op.Context))
				for k := range op.Context {
					keys = append(keys, k)
				}
				// Sort keys alphabetically
				for i := 0; i < len(keys); i++ {
					for j := i + 1; j < len(keys); j++ {
						if keys[i] > keys[j] {
							keys[i], keys[j] = keys[j], keys[i]
						}
					}
				}
				for _, key := range keys {
					parts = append(parts, key)
					parts = append(parts, fmt.Sprintf("%d", op.Context[key]))
				}
			}
		}
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
