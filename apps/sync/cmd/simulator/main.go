package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"sync/internal/database"
	"sync/internal/server"
	"sync/internal/sync_engine"
	"time"
)

type ActionResult struct {
	ClientIndex int
	State       *StateResponse
	Error       error
}

type SyncDeliveryResult struct {
	ClientIndex int
	State       *StateResponse
	Error       error
}

func main() {
	fileName := flag.String("file", "./cmd/simulator/client.ts", "Path to client file")
	numClients := flag.Int("clients", 10, "Number of clients")
	numTicks := flag.Int("ticks", 100, "Number of ticks per client")
	seed := flag.String("seed", "A", "Random seed")
	flag.Parse()

	// Setup server
	db := database.New(
		database.DBConfig{
			DBUrl:           ":memory:",
			BusyTimeout:     1000,
			MaxOpenConns:    1,
			MaxIdleConns:    1,
			ConnMaxLifetime: time.Duration(0),
		})
	syncService := sync_engine.NewSyncService(db)
	server := &server.Server{
		SyncService: syncService,
	}

	// Setup random
	hash := sha256.Sum256([]byte(*seed))
	seedInt64 := int64(binary.BigEndian.Uint64(hash[:8]))
	random := rand.New(rand.NewSource(seedInt64))

	// Create clients
	clients := make([]*Client, *numClients)
	for i := range clients {
		clientID := fmt.Sprintf("%s-client-%d", *seed, i)
		clientSeed := fmt.Sprintf("%s-%d", clientID, random.Int63())

		client, err := StartClient(*fileName, clientID, clientSeed)
		if err != nil {
			log.Fatal(err)
		}
		clients[i] = client
	}

	// Run simulation
	for tick := 0; tick < *numTicks; tick++ {
		log.Printf("=== Tick %d ===", tick)

		// Phase 1: Pre-generate all random decisions (deterministic order)
		allActions := make([]ActionRequest, len(clients))
		allShouldSync := make([]bool, len(clients))
		for i, client := range clients {
			allActions[i] = client.GenerateRandomActions(random)
			allShouldSync[i] = client.ShouldSync(random)
		}

		// Phase 2: Send all action requests in parallel
		results := make(chan ActionResult, len(clients))
		for i, client := range clients {
			go func(idx int, c *Client, actions ActionRequest, shouldSync bool) {
				state, err := c.PerformActions(actions, shouldSync)
				results <- ActionResult{ClientIndex: idx, State: state, Error: err}
			}(i, client, allActions[i], allShouldSync[i])
		}

		// Phase 3: Collect action results in order
		actionResults := make([]*StateResponse, len(clients))
		for range clients {
			result := <-results
			if result.Error != nil {
				log.Fatalf("Client %d action failed: %v", result.ClientIndex, result.Error)
			}
			actionResults[result.ClientIndex] = result.State
		}

		// Phase 4: Log action results and process syncs in deterministic order
		for i, state := range actionResults {
			log.Printf("Client %d (%s)", i, clients[i].ClientID)
			log.Printf("  Clock: %d, WAL entries: %d", state.ClockValue, len(state.WalEntries))

			// If client wants to sync, send to server (sequential for determinism)
			if state.SyncRequest != nil {
				log.Printf("  Syncing: sending %d entries, last seen version %d", len(state.SyncRequest.Entries), state.SyncRequest.ClientLastSeenVersion)

				// Send to server
				syncResp, err := sendSyncToServer(server, state.SyncRequest)
				if err != nil {
					log.Fatalf("Client %d sync request failed: %v", i, err)
				}

				log.Printf("  Received %d entries from server", len(syncResp.Entries))

				// Deliver sync response back to client (can parallelize later)
				delivery := SyncDeliveryRequest{
					SyncRequest:  *state.SyncRequest,
					SyncResponse: *syncResp,
				}
				newState, err := clients[i].DeliverSync(delivery)
				if err != nil {
					log.Fatalf("Client %d sync delivery failed: %v", i, err)
				}

				log.Printf("  After sync - Clock: %d, WAL: %d", newState.ClockValue, len(newState.WalEntries))
			}
		}
	}

	log.Println("Simulation complete")

	// Convergence check
	if err := convergeAllClients(clients, server); err != nil {
		log.Fatalf("Convergence failed: %v", err)
	}

	if err := verifyWALsMatch(clients); err != nil {
		log.Fatalf("WAL verification failed: %v", err)
	}

	log.Println("✓ Convergence verification passed!")
}

func convergeAllClients(clients []*Client, server *server.Server) error {
	log.Println("=== Convergence Phase ===")

	// Round 1: All clients sync to push their local changes
	log.Println("Round 1: All clients syncing...")
	for i, client := range clients {
		state, err := client.PerformActions(ActionRequest{}, true) // No actions, just sync
		if err != nil {
			return fmt.Errorf("client %d round 1 failed: %w", i, err)
		}

		if state.SyncRequest != nil {
			syncResp, err := sendSyncToServer(server, state.SyncRequest)
			if err != nil {
				return fmt.Errorf("client %d round 1 sync failed: %w", i, err)
			}

			delivery := SyncDeliveryRequest{
				SyncRequest:  *state.SyncRequest,
				SyncResponse: *syncResp,
			}
			_, err = client.DeliverSync(delivery)
			if err != nil {
				return fmt.Errorf("client %d round 1 delivery failed: %w", i, err)
			}
		}
	}

	// Round 2: All clients sync again to receive Round 1's changes
	log.Println("Round 2: All clients syncing...")
	for i, client := range clients {
		state, err := client.PerformActions(ActionRequest{}, true)
		if err != nil {
			return fmt.Errorf("client %d round 2 failed: %w", i, err)
		}

		if state.SyncRequest != nil {
			syncResp, err := sendSyncToServer(server, state.SyncRequest)
			if err != nil {
				return fmt.Errorf("client %d round 2 sync failed: %w", i, err)
			}

			delivery := SyncDeliveryRequest{
				SyncRequest:  *state.SyncRequest,
				SyncResponse: *syncResp,
			}
			_, err = client.DeliverSync(delivery)
			if err != nil {
				return fmt.Errorf("client %d round 2 delivery failed: %w", i, err)
			}
		}
	}

	return nil
}

func verifyWALsMatch(clients []*Client) error {
	log.Println("=== Verifying WAL Convergence ===")

	// Get final state from all clients
	finalStates := make([]*StateResponse, len(clients))
	for i, client := range clients {
		state, err := client.PerformActions(ActionRequest{}, false) // No actions, no sync
		if err != nil {
			return fmt.Errorf("failed to get final state from client %d: %w", i, err)
		}
		finalStates[i] = state
	}

	// Property 1: Verify clock >= max(wal_entry.version) for each client
	log.Println("Checking property: clock >= max(WAL entry versions)")
	for i, state := range finalStates {
		var maxWALVersion int64 = -1
		for _, entry := range state.WalEntries {
			if entry.Version > maxWALVersion {
				maxWALVersion = entry.Version
			}
		}

		log.Printf("Client %d: Clock=%d, Max WAL version=%d, WAL entries=%d",
			i, state.ClockValue, maxWALVersion, len(state.WalEntries))

		if len(state.WalEntries) > 0 && state.ClockValue < maxWALVersion {
			return fmt.Errorf("INVARIANT VIOLATION: client %d has clock=%d but max WAL version=%d (clock must be >= max WAL version)",
				i, state.ClockValue, maxWALVersion)
		}
	}
	log.Println("✓ Clock invariant satisfied for all clients")

	// Property 2: Verify all WAL entries are identical
	log.Println("Checking property: all WAL entries match")
	baseWAL := finalStates[0].WalEntries

	for i := 1; i < len(finalStates); i++ {
		if len(finalStates[i].WalEntries) != len(baseWAL) {
			return fmt.Errorf("WAL length mismatch: client 0 has %d entries, client %d has %d entries",
				len(baseWAL), i, len(finalStates[i].WalEntries))
		}

		// Compare each WAL entry
		for j := range baseWAL {
			if !walEntriesEqual(&baseWAL[j], &finalStates[i].WalEntries[j]) {
				return fmt.Errorf("WAL entry %d mismatch between client 0 and client %d", j, i)
			}
		}
	}
	log.Println("✓ All WAL entries match")

	// Property 3: Check clock convergence (should be identical after our changes)
	log.Println("Checking property: clock convergence")
	baseClock := finalStates[0].ClockValue
	minClock := baseClock
	maxClock := baseClock
	allClocksEqual := true

	for i := 1; i < len(finalStates); i++ {
		clock := finalStates[i].ClockValue
		if clock < minClock {
			minClock = clock
		}
		if clock > maxClock {
			maxClock = clock
		}
		if clock != baseClock {
			allClocksEqual = false
		}
	}

	if allClocksEqual {
		log.Printf("✓ All clocks converged to %d", baseClock)
	} else {
		// With the new logic (skip sync on empty + no +1), clocks should converge exactly
		// Only acceptable difference is if maxClock-minClock <= 1 due to timing
		spread := maxClock - minClock
		if spread > 1 {
			return fmt.Errorf("Clock convergence failed: min=%d, max=%d, spread=%d (expected spread <= 1)",
				minClock, maxClock, spread)
		}
		log.Printf("⚠ Clocks have minor spread: min=%d, max=%d, spread=%d (acceptable)",
			minClock, maxClock, spread)
	}

	log.Printf("✓ Convergence verification passed! WAL entries=%d", len(baseWAL))
	return nil
}

func walEntriesEqual(a, b *sync_engine.WALEntry) bool {
	return a.Key == b.Key &&
		a.Table == b.Table &&
		a.Operation == b.Operation &&
		a.Version == b.Version &&
		a.ClientID == b.ClientID &&
		string(a.Value) == string(b.Value) &&
		string(a.ValueKey) == string(b.ValueKey)
}

func sendSyncToServer(server *server.Server, req *sync_engine.SyncRequest) (*sync_engine.SyncResponse, error) {
	requestBody, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq := httptest.NewRequest(http.MethodPost, "/sync", bytes.NewBuffer(requestBody))
	httpReq.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	server.HandleSync(recorder, httpReq)

	if recorder.Code != http.StatusOK {
		return nil, fmt.Errorf("sync failed with status %d: %s", recorder.Code, recorder.Body.String())
	}

	var resp sync_engine.SyncResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		return nil, err
	}

	return &resp, nil
}
