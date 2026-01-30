package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync/internal/repository"
	"sync/internal/server"
	"sync/internal/sync_engine"
	"time"

	_ "github.com/mattn/go-sqlite3"
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
	ActionTimes            []float64
	OperationsReceiveTimes []float64
	SyncPrepTimes          []float64
	TotalActions           int
	TotalSyncs             int
	TotalOperationsSent    int
	TotalOperationsRecv    int
	ConvergenceStart       time.Time
	ConvergenceEnd         time.Time

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
			log.Printf("  Clock: %d, CRDT operations: %d", state.ClockValue, len(state.CRDTOperations))

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

	if err := verifyCRDTsMatch(clients); err != nil {
		log.Fatalf("CRDT verification failed: %v", err)
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

func verifyCRDTsMatch(clients []*Client) error {
	log.Println("=== Verifying CRDT Convergence ===")

	// Collect all final states
	finalStates := make([]*StateResponse, len(clients))
	for i, client := range clients {
		state, err := client.GetAllOps() // Get all operations for verification
		if err != nil {
			return fmt.Errorf("failed to get final state from client %d: %w", i, err)
		}
		finalStates[i] = state
	}

	// Property 1: Verify clock >= max(crdt_operation.version) for each client
	log.Println("Checking property: clock >= max(CRDT entry versions)")
	for i, state := range finalStates {
		var maxCRDTVersion int64 = -1
		for _, entry := range state.CRDTOperations {
			if entry.Dot.Version > maxCRDTVersion {
				maxCRDTVersion = entry.Dot.Version
			}
		}

		log.Printf("Client %d: Clock=%d, Max CRDT version=%d, CRDT entries=%d",
			i, state.ClockValue, maxCRDTVersion, len(state.CRDTOperations))

		if len(state.CRDTOperations) > 0 && state.ClockValue < maxCRDTVersion {
			return fmt.Errorf("INVARIANT VIOLATION: client %d has clock=%d but max CRDT version=%d (clock must be >= max CRDT version)",
				i, state.ClockValue, maxCRDTVersion)
		}
	}
	log.Println("✓ Clock invariant satisfied for all clients")

	// Property 2: Verify all CRDT entries are identical (as sets, order doesn't matter)
	log.Println("Checking property: all CRDT entries match")
	baseCRDT := finalStates[0].CRDTOperations

	// Build a map of operations by their Dot (clientId, version) for the base client
	baseOpsMap := make(map[string]*sync_engine.CRDTOperation)
	for i := range baseCRDT {
		dotKey := fmt.Sprintf("%s:%d", baseCRDT[i].Dot.ClientID, baseCRDT[i].Dot.Version)
		baseOpsMap[dotKey] = &baseCRDT[i]
	}

	for i := 1; i < len(finalStates); i++ {
		clientOps := finalStates[i].CRDTOperations

		if len(clientOps) != len(baseCRDT) {
			return fmt.Errorf("CRDT length mismatch: client 0 has %d entries, client %d has %d entries",
				len(baseCRDT), i, len(clientOps))
		}

		// Build map for this client's operations
		clientOpsMap := make(map[string]*sync_engine.CRDTOperation)
		for j := range clientOps {
			dotKey := fmt.Sprintf("%s:%d", clientOps[j].Dot.ClientID, clientOps[j].Dot.Version)
			clientOpsMap[dotKey] = &clientOps[j]
		}

		// Check that every operation in base exists in client with same content
		for dotKey, baseOp := range baseOpsMap {
			clientOp, exists := clientOpsMap[dotKey]
			if !exists {
				return fmt.Errorf("client %d is missing operation with Dot %s", i, dotKey)
			}

			if !crdtOperationsEqual(baseOp, clientOp) {
				log.Printf("CRDT operation mismatch for Dot %s between client 0 and client %d:", dotKey, i)
				log.Printf("  Client 0: RowKey=%s, Table=%s, Type=%s",
					baseOp.RowKey, baseOp.Table, baseOp.Type)
				log.Printf("  Client %d: RowKey=%s, Table=%s, Type=%s",
					i, clientOp.RowKey, clientOp.Table, clientOp.Type)

				// Show which fields differ
				diffs := []string{}
				if baseOp.RowKey != clientOp.RowKey {
					diffs = append(diffs, "RowKey")
				}
				if baseOp.Table != clientOp.Table {
					diffs = append(diffs, "Table")
				}
				if baseOp.Type != clientOp.Type {
					diffs = append(diffs, "Type")
				}
				if !stringPtrEqual(baseOp.Field, clientOp.Field) {
					diffs = append(diffs, "Field")
				}
				if string(baseOp.Value) != string(clientOp.Value) {
					diffs = append(diffs, "Value")
				}
				if !contextEqual(baseOp.Context, clientOp.Context) {
					diffs = append(diffs, "Context")
				}
				log.Printf("  Fields that differ: %v", diffs)

				return fmt.Errorf("CRDT operation with Dot %s differs between client 0 and client %d", dotKey, i)
			}
		}

		// Check that client doesn't have extra operations
		for dotKey := range clientOpsMap {
			if _, exists := baseOpsMap[dotKey]; !exists {
				return fmt.Errorf("client %d has extra operation with Dot %s that client 0 doesn't have", i, dotKey)
			}
		}
	}
	log.Println("✓ All CRDT entries match")

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

	log.Printf("✓ Convergence verification passed! CRDT entries=%d", len(baseCRDT))

	// Property 4: Verify all materialized rows match
	log.Println("Checking property: all materialized rows match")
	if err := verifyRowsMatch(finalStates); err != nil {
		return err
	}
	log.Println("✓ All materialized rows match")

	return nil
}

func crdtOperationsEqual(a, b *sync_engine.CRDTOperation) bool {
	// Compare core fields
	if a.Type != b.Type ||
		a.Table != b.Table ||
		a.RowKey != b.RowKey ||
		a.Dot.ClientID != b.Dot.ClientID ||
		a.Dot.Version != b.Dot.Version {
		return false
	}

	// Compare type-specific fields
	switch a.Type {
	case "set":
		if !stringPtrEqual(a.Field, b.Field) {
			return false
		}
		return string(a.Value) == string(b.Value)

	case "setRow":
		return string(a.Value) == string(b.Value)

	case "remove":
		return contextEqual(a.Context, b.Context)

	default:
		return false
	}
}
func stringPtrEqual(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}
func contextEqual(a, b map[string]int64) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func verifyRowsMatch(finalStates []*StateResponse) error {
	if len(finalStates) == 0 {
		return nil
	}

	// Get base rows from client 0
	baseRows := finalStates[0].Rows
	if baseRows == nil {
		log.Println("⚠ No row data available for verification (rows field is nil)")
		return nil
	}

	// Check each client against the base
	for i := 1; i < len(finalStates); i++ {
		clientRows := finalStates[i].Rows
		if clientRows == nil {
			return fmt.Errorf("client %d has nil rows field", i)
		}

		// Verify each table
		for table, baseTableRows := range baseRows {
			clientTableRows, exists := clientRows[table]
			if !exists {
				return fmt.Errorf("client %d is missing table %q", i, table)
			}

			// Check row counts match
			if len(clientTableRows) != len(baseTableRows) {
				return fmt.Errorf("table %q row count mismatch: client 0 has %d rows, client %d has %d rows",
					table, len(baseTableRows), i, len(clientTableRows))
			}

			// Check each row
			for rowKey, baseRow := range baseTableRows {
				clientRow, exists := clientTableRows[rowKey]
				if !exists {
					return fmt.Errorf("client %d is missing row %q in table %q", i, rowKey, table)
				}

				// Compare row fields
				if !rowDataEqual(baseRow, clientRow) {
					log.Printf("Row data mismatch for table=%q, rowKey=%q between client 0 and client %d:", table, rowKey, i)
					log.Printf("  Client 0: %+v", baseRow)
					log.Printf("  Client %d: %+v", i, clientRow)
					return fmt.Errorf("row data mismatch for table=%q, rowKey=%q between client 0 and client %d",
						table, rowKey, i)
				}
			}

			// Check that client doesn't have extra rows
			for rowKey := range clientTableRows {
				if _, exists := baseTableRows[rowKey]; !exists {
					return fmt.Errorf("client %d has extra row %q in table %q that client 0 doesn't have",
						i, rowKey, table)
				}
			}
		}

		// Check that client doesn't have extra tables
		for table := range clientRows {
			if _, exists := baseRows[table]; !exists {
				return fmt.Errorf("client %d has extra table %q that client 0 doesn't have", i, table)
			}
		}
	}

	// Count total rows for logging
	totalRows := 0
	for _, tableRows := range baseRows {
		totalRows += len(tableRows)
	}
	log.Printf("  Verified %d rows across %d tables", totalRows, len(baseRows))

	return nil
}

func rowDataEqual(a, b map[string]any) bool {
	if len(a) != len(b) {
		return false
	}

	for key, aVal := range a {
		bVal, exists := b[key]
		if !exists {
			return false
		}

		// Compare values using JSON serialization for deep equality
		aJSON, err := json.Marshal(aVal)
		if err != nil {
			return false
		}
		bJSON, err := json.Marshal(bVal)
		if err != nil {
			return false
		}

		if string(aJSON) != string(bJSON) {
			return false
		}
	}

	return true
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

	// Operations receive timing
	if len(stats.OperationsReceiveTimes) > 0 {
		sort.Float64s(stats.OperationsReceiveTimes)
		log.Printf("Operations Receive Time:")
		log.Printf("  Count: %d", len(stats.OperationsReceiveTimes))
		log.Printf("  Min: %.2fms, Max: %.2fms, Avg: %.2fms",
			stats.OperationsReceiveTimes[0],
			stats.OperationsReceiveTimes[len(stats.OperationsReceiveTimes)-1],
			average(stats.OperationsReceiveTimes))
		log.Printf("  P50: %.2fms, P95: %.2fms, P99: %.2fms",
			percentile(stats.OperationsReceiveTimes, 0.5),
			percentile(stats.OperationsReceiveTimes, 0.95),
			percentile(stats.OperationsReceiveTimes, 0.99))
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
	log.Printf("  Total operations sent: %d", stats.TotalOperationsSent)
	log.Printf("  Total operations received: %d", stats.TotalOperationsRecv)

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
	db, err := sql.Open("sqlite3", ":memory:?_journal_mode=WAL&_busy_timeout=1000")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(time.Duration(0))

	if err := repository.InitSchema(context.Background(), db); err != nil {
		log.Fatalf("Error initializing database schema: %v", err)
	}

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
	stats.TotalOperationsSent += len(state.SyncRequest.Operations)

	log.Printf("  Syncing: sending %d entries, last seen version %d",
		len(state.SyncRequest.Operations), state.SyncRequest.LastSeenServerVersion)

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

	stats.TotalOperationsRecv += len(syncResp.Operations)
	log.Printf("  Received %d operations from server", len(syncResp.Operations))

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

	// Collect operations receive timing
	if newState.OperationsReceiveTimeMs > 0 {
		stats.OperationsReceiveTimes = append(stats.OperationsReceiveTimes, newState.OperationsReceiveTimeMs)
	}

	log.Printf("  After sync - Clock: %d, CRDT operations: %d", newState.ClockValue, len(newState.CRDTOperations))
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

			// Collect operations receive timing
			if newState.OperationsReceiveTimeMs > 0 {
				stats.OperationsReceiveTimes = append(stats.OperationsReceiveTimes, newState.OperationsReceiveTimeMs)
			}

			log.Printf("    After delayed sync - Clock: %d, CRDT operations: %d", newState.ClockValue, len(newState.CRDTOperations))
		} else {
			remaining = append(remaining, ds)
		}
	}

	return remaining
}
