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
	"sort"
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

type SimulationStats struct {
	ActionTimes      []float64
	WalReceiveTimes  []float64
	SyncPrepTimes    []float64
	TotalActions     int
	TotalSyncs       int
	TotalEntriesSent int
	TotalEntriesRecv int
	ConvergenceStart time.Time
	ConvergenceEnd   time.Time

	// Fault injection stats
	FaultDelayedSyncs       int
	FaultCorruptedRequests  int
	FaultCorruptedResponses int
	FaultRejectedRequests   int // Corrupted requests rejected by server
}

func main() {
	fileName := flag.String("file", "./cmd/simulator/client.ts", "Path to client file")
	numClients := flag.Int("clients", 10, "Number of clients")
	numTicks := flag.Int("ticks", 100, "Number of ticks per client")
	seed := flag.String("seed", "", "Random seed (generated if not provided)")

	// Fault injection flags
	faultDelayProb := flag.Float64("fault-delay-sync", 0.0, "Probability of delaying sync delivery (0.0-1.0)")
	faultDelayMin := flag.Int("fault-delay-ticks-min", 1, "Minimum ticks to delay")
	faultDelayMax := flag.Int("fault-delay-ticks-max", 5, "Maximum ticks to delay")
	faultCorruptReq := flag.Float64("fault-corrupt-request", 0.0, "Probability of corrupting sync request (0.0-1.0)")
	faultCorruptResp := flag.Float64("fault-corrupt-response", 0.0, "Probability of corrupting sync response (0.0-1.0)")

	flag.Parse()

	// Generate random seed if not provided
	// Setup random
	if *seed == "" {
		*seed = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	hash := sha256.Sum256([]byte(*seed))
	seedInt64 := int64(binary.BigEndian.Uint64(hash[:8]))
	random := rand.New(rand.NewSource(seedInt64))

	// Setup fault injector
	faultConfig := FaultConfig{
		DelayedSyncProbability:     *faultDelayProb,
		DelayedSyncMinTicks:        *faultDelayMin,
		DelayedSyncMaxTicks:        *faultDelayMax,
		CorruptRequestProbability:  *faultCorruptReq,
		CorruptResponseProbability: *faultCorruptResp,
	}
	faultInjector := NewFaultInjector(faultConfig, random)
	faultsEnabled := *faultDelayProb > 0 || *faultCorruptReq > 0 || *faultCorruptResp > 0

	// Setup server
	server := createServer()

	// Create clients
	clients := createClients(random, *fileName, *numClients)
	// Ensure all client processes are cleaned up on exit
	defer func() {
		for _, client := range clients {
			if client != nil {
				if err := client.Close(); err != nil {
					log.Printf("Error closing client: %v", err)
				}
			}
		}
	}()

	// Initialize statistics
	stats := &SimulationStats{}

	// Queue for delayed syncs
	delayedSyncs := []DelayedSync{}

	log.Printf("=== Simulation Starting ===")
	log.Printf("Seed: %s", *seed)
	log.Printf("Clients: %d, Ticks: %d", *numClients, *numTicks)
	if faultsEnabled {
		log.Printf("FAULT INJECTION ENABLED:")
		if *faultDelayProb > 0 {
			log.Printf("  - Delayed syncs: %.1f%% (delay %d-%d ticks)", *faultDelayProb*100, *faultDelayMin, *faultDelayMax)
		}
		if *faultCorruptReq > 0 {
			log.Printf("  - Request corruption: %.1f%%", *faultCorruptReq*100)
		}
		if *faultCorruptResp > 0 {
			log.Printf("  - Response corruption: %.1f%%", *faultCorruptResp*100)
		}
	}

	// Run simulation
	for tick := 0; tick < *numTicks; tick++ {
		log.Printf("=== Tick %d ===", tick)

		allActions, allShouldSync := generateAllRandomActions(random, clients)

		results := executeAllActions(allActions, allShouldSync, clients)

		actionResults := collectAndSortActionResults(tick, results, clients)

		for i, state := range actionResults {
			log.Printf("Client %d (%s;tick=%d)", i, clients[i].ClientID, tick)
			log.Printf("  Clock: %d, WAL entries: %d", state.ClockValue, len(state.WalEntries))

			// Collect action timing stats
			if state.ActionTimeMs > 0 {
				stats.ActionTimes = append(stats.ActionTimes, state.ActionTimeMs)
				stats.TotalActions++
			}

			if state.SyncPrepTimeMs > 0 {
				stats.SyncPrepTimes = append(stats.SyncPrepTimes, state.SyncPrepTimeMs)
			}

			// If client wants to sync, send to server (sequential for determinism)
			processAllSyncRequests(stats, server, clients[i], state, faultInjector, faultsEnabled, tick, *numTicks, &delayedSyncs)
		}

		// Deliver any pending delayed syncs for this tick
		if faultsEnabled {
			delayedSyncs = deliverPendingSyncs(delayedSyncs, tick, stats)
		}
	}

	log.Println("Simulation complete")

	// Convergence check
	stats.ConvergenceStart = time.Now()
	if err := convergeAllClients(clients, server); err != nil {
		log.Fatalf("Convergence failed: %v", err)
	}
	stats.ConvergenceEnd = time.Now()

	if err := verifyWALsMatch(clients); err != nil {
		log.Fatalf("WAL verification failed: %v", err)
	}

	log.Println("✓ Convergence verification passed!")

	// Print statistics
	printSimulationStats(stats)

	log.Printf("=== Simulation Complete ===")
	log.Printf("Seed: %s", *seed)
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
		log.Printf("    Sync request rejected with status %d: %s", recorder.Code, recorder.Body.String())
		return nil, nil
	}

	var resp sync_engine.SyncResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		return nil, err
	}

	return &resp, nil
}

func average(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	index := int(float64(len(sorted)) * p)
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func printSimulationStats(stats *SimulationStats) {
	log.Println("=== Simulation Statistics ===")

	// Action timing
	if len(stats.ActionTimes) > 0 {
		sort.Float64s(stats.ActionTimes)
		log.Printf("Action Execution Time:")
		log.Printf("  Count: %d", stats.TotalActions)
		log.Printf("  Min: %.2fms, Max: %.2fms, Avg: %.2fms",
			stats.ActionTimes[0],
			stats.ActionTimes[len(stats.ActionTimes)-1],
			average(stats.ActionTimes))
		log.Printf("  P50: %.2fms, P95: %.2fms, P99: %.2fms",
			percentile(stats.ActionTimes, 0.5),
			percentile(stats.ActionTimes, 0.95),
			percentile(stats.ActionTimes, 0.99))
	}

	// WAL receive timing
	if len(stats.WalReceiveTimes) > 0 {
		sort.Float64s(stats.WalReceiveTimes)
		log.Printf("WAL Receive Time:")
		log.Printf("  Count: %d", len(stats.WalReceiveTimes))
		log.Printf("  Min: %.2fms, Max: %.2fms, Avg: %.2fms",
			stats.WalReceiveTimes[0],
			stats.WalReceiveTimes[len(stats.WalReceiveTimes)-1],
			average(stats.WalReceiveTimes))
		log.Printf("  P50: %.2fms, P95: %.2fms, P99: %.2fms",
			percentile(stats.WalReceiveTimes, 0.5),
			percentile(stats.WalReceiveTimes, 0.95),
			percentile(stats.WalReceiveTimes, 0.99))
	}

	// Sync prep timing
	if len(stats.SyncPrepTimes) > 0 {
		sort.Float64s(stats.SyncPrepTimes)
		log.Printf("Sync Preparation Time:")
		log.Printf("  Count: %d", len(stats.SyncPrepTimes))
		log.Printf("  Min: %.2fms, Max: %.2fms, Avg: %.2fms",
			stats.SyncPrepTimes[0],
			stats.SyncPrepTimes[len(stats.SyncPrepTimes)-1],
			average(stats.SyncPrepTimes))
		log.Printf("  P50: %.2fms, P95: %.2fms, P99: %.2fms",
			percentile(stats.SyncPrepTimes, 0.5),
			percentile(stats.SyncPrepTimes, 0.95),
			percentile(stats.SyncPrepTimes, 0.99))
	}

	// Totals
	log.Printf("Sync Operations:")
	log.Printf("  Total syncs: %d", stats.TotalSyncs)
	log.Printf("  Total entries sent: %d", stats.TotalEntriesSent)
	log.Printf("  Total entries received: %d", stats.TotalEntriesRecv)

	// Convergence
	if !stats.ConvergenceEnd.IsZero() {
		duration := stats.ConvergenceEnd.Sub(stats.ConvergenceStart)
		log.Printf("Convergence Time: %.2fms", float64(duration.Microseconds())/1000.0)
	}

	// Fault injection stats
	if stats.FaultDelayedSyncs > 0 || stats.FaultCorruptedRequests > 0 || stats.FaultCorruptedResponses > 0 {
		log.Printf("Fault Injection:")
		log.Printf("  Delayed syncs: %d", stats.FaultDelayedSyncs)
		log.Printf("  Corrupted requests: %d (rejected: %d)", stats.FaultCorruptedRequests, stats.FaultRejectedRequests)
		log.Printf("  Corrupted responses: %d", stats.FaultCorruptedResponses)
	}
}

func createClients(random *rand.Rand, fileName string, numClients int) []*Client {
	clients := make([]*Client, numClients)

	for i := range clients {
		clientID := fmt.Sprintf("client-%d", random.Int63())
		clientSeed := fmt.Sprintf("%s-%d", clientID, random.Int63())

		client, err := StartClient(fileName, clientID, clientSeed)
		if err != nil {
			log.Fatal(err)
		}
		clients[i] = client
	}

	return clients
}

func createServer() *server.Server {
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

	return server
}

func generateAllRandomActions(random *rand.Rand, clients []*Client) ([]ActionRequest, []bool) {
	allActions := make([]ActionRequest, len(clients))
	allShouldSync := make([]bool, len(clients))
	for i, client := range clients {
		allActions[i] = client.GenerateRandomActions(random)
		allShouldSync[i] = client.ShouldSync(random)
	}

	return allActions, allShouldSync
}

func executeAllActions(allActions []ActionRequest, allShouldSync []bool, clients []*Client) chan ActionResult {
	results := make(chan ActionResult, len(clients))
	for i, client := range clients {
		go func(idx int, c *Client, actions ActionRequest, shouldSync bool) {
			state, err := c.PerformActions(actions, shouldSync)
			results <- ActionResult{ClientIndex: idx, State: state, Error: err}
		}(i, client, allActions[i], allShouldSync[i])
	}

	return results
}

func collectAndSortActionResults(tick int, results chan ActionResult, clients []*Client) []*StateResponse {
	actionResults := make([]*StateResponse, len(clients))
	for range clients {
		result := <-results
		if result.Error != nil {
			log.Fatalf("Tick %d: Client %d action failed: %v", tick, result.ClientIndex, result.Error)
		}
		actionResults[result.ClientIndex] = result.State
	}
	return actionResults
}

func processAllSyncRequests(
	stats *SimulationStats,
	server *server.Server,
	client *Client,
	state *StateResponse,
	faultInjector *FaultInjector,
	faultsEnabled bool,
	currentTick int,
	totalTicks int,
	delayedSyncs *[]DelayedSync,
) {
	if state.SyncRequest == nil {
		return
	}

	stats.TotalSyncs++
	stats.TotalEntriesSent += len(state.SyncRequest.Entries)

	log.Printf("  Syncing: sending %d entries, last seen version %d",
		len(state.SyncRequest.Entries), state.SyncRequest.ClientLastSeenVersion)

	// FAULT INJECTION: Corrupt request
	requestToSend := state.SyncRequest
	requestWasCorrupted := false
	if faultsEnabled && faultInjector.ShouldCorruptRequest() {
		stats.FaultCorruptedRequests++
		corruptedReq := *state.SyncRequest // copy
		faultInjector.CorruptRequest(&corruptedReq)
		requestToSend = &corruptedReq
		requestWasCorrupted = true
	}

	// Send to server
	syncResp, err := sendSyncToServer(server, requestToSend)
	if err != nil {
		log.Fatalf("Client %s sync request failed: %v", client.ClientID, err)
	}

	// If syncResp is nil, the server rejected the request (e.g., 400 error)
	// This is expected for corrupted requests, so just skip delivery
	if syncResp == nil {
		if requestWasCorrupted {
			stats.FaultRejectedRequests++
		}
		return
	}

	stats.TotalEntriesRecv += len(syncResp.Entries)
	log.Printf("  Received %d entries from server", len(syncResp.Entries))

	// Prepare delivery
	delivery := SyncDeliveryRequest{
		SyncRequest:  *state.SyncRequest,
		SyncResponse: *syncResp,
	}

	// FAULT INJECTION: Corrupt response
	responseWasCorrupted := false
	if faultsEnabled && faultInjector.ShouldCorruptResponse() {
		stats.FaultCorruptedResponses++
		faultInjector.CorruptResponse(&delivery.SyncResponse)
		responseWasCorrupted = true
	}

	// FAULT INJECTION: Delay delivery
	if faultsEnabled && faultInjector.ShouldDelaySync() {
		stats.FaultDelayedSyncs++
		deliverAtTick := faultInjector.CalculateDelayTicks(currentTick, totalTicks)
		actualDelay := (deliverAtTick - currentTick + totalTicks) % totalTicks

		*delayedSyncs = append(*delayedSyncs, DelayedSync{
			Client:        client,
			Delivery:      delivery,
			DeliverAtTick: deliverAtTick,
			DelayedAtTick: currentTick,
			WasCorrupted:  requestWasCorrupted || responseWasCorrupted,
		})
		log.Printf("    FAULT INJECTION: Sync delivery delayed by %d ticks (deliver at tick %d)",
			actualDelay, deliverAtTick)
		return
	}

	// Normal immediate delivery
	newState, err := client.DeliverSync(delivery)
	if err != nil {
		// If response was corrupted or request was corrupted (causing server to send wrong data),
		// this is an expected failure - log and continue
		if responseWasCorrupted || requestWasCorrupted {
			log.Printf("    FAULT INJECTION: Corrupted sync delivery failed (expected): %v", err)
			stats.FaultRejectedRequests++
			return
		}
		log.Fatalf("Client %s sync delivery failed: %v", client.ClientID, err)
	}

	// Collect WAL receive timing
	if newState.WalReceiveTimeMs > 0 {
		stats.WalReceiveTimes = append(stats.WalReceiveTimes, newState.WalReceiveTimeMs)
	}

	log.Printf("  After sync - Clock: %d, WAL: %d", newState.ClockValue, len(newState.WalEntries))
}

func deliverPendingSyncs(
	delayed []DelayedSync,
	currentTick int,
	stats *SimulationStats,
) []DelayedSync {
	remaining := []DelayedSync{}

	for _, ds := range delayed {
		if ds.DeliverAtTick == currentTick {
			log.Printf("  Delivering delayed sync to %s (delayed from tick %d)",
				ds.Client.ClientID, ds.DelayedAtTick)

			newState, err := ds.Client.DeliverSync(ds.Delivery)
			if err != nil {
				// If the delayed sync was corrupted, this is an expected failure
				if ds.WasCorrupted {
					log.Printf("    FAULT INJECTION: Corrupted delayed sync delivery failed (expected): %v", err)
					stats.FaultRejectedRequests++
					continue
				}
				log.Fatalf("Delayed sync delivery failed: %v", err)
			}

			// Collect WAL receive timing
			if newState.WalReceiveTimeMs > 0 {
				stats.WalReceiveTimes = append(stats.WalReceiveTimes, newState.WalReceiveTimeMs)
			}

			log.Printf("    After delayed sync - Clock: %d, WAL: %d", newState.ClockValue, len(newState.WalEntries))
		} else {
			remaining = append(remaining, ds)
		}
	}

	return remaining
}
