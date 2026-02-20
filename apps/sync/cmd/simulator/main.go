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

const (
	// maxQueueDrainTicks is the safety limit for draining queues after simulation ends.
	// This prevents infinite loops if there's a bug in queue processing.
	// Should be larger than the maximum configured delay (DelayedSyncMaxTicks).
	maxQueueDrainTicks = 100
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
	faultDelayProb := flag.Float64("fault-delay-sync", 0.1, "Probability of delaying sync delivery (0.0-1.0)")
	faultDelayMin := flag.Int("fault-delay-ticks-min", 1, "Minimum ticks to delay")
	faultDelayMax := flag.Int("fault-delay-ticks-max", 5, "Maximum ticks to delay")
	faultCorruptReq := flag.Float64("fault-corrupt-request", 0.1, "Probability of corrupting sync request (0.0-1.0)")
	faultCorruptResp := flag.Float64("fault-corrupt-response", 0.1, "Probability of corrupting sync response (0.0-1.0)")

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

	// Initialize request/response queues
	requestQueue := &RequestQueue{}
	responseQueue := &ResponseQueue{}

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

		// 1. Log action results and collect stats
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
		}

		// 2. Enqueue sync requests with latency
		for i, state := range actionResults {
			enqueueSyncRequest(requestQueue, clients[i], i, state, faultInjector, faultsEnabled, tick, *numTicks, stats)
		}

		// 3. Process ready requests from queue (with deterministic shuffle)
		processReadyRequests(requestQueue, responseQueue, server, random, faultInjector, faultsEnabled, tick, *numTicks, stats)

		// 4. Deliver ready responses to clients
		deliverReadyResponses(responseQueue, clients, tick, stats)
	}

	log.Println("Simulation complete")

	// Drain queues before convergence
	log.Println("Draining pending requests/responses...")
	finalTick := *numTicks
	for requestQueue.Len() > 0 || responseQueue.Len() > 0 {
		log.Printf("  Queue status: %d requests, %d responses pending", requestQueue.Len(), responseQueue.Len())
		processReadyRequests(requestQueue, responseQueue, server, random, faultInjector, faultsEnabled, finalTick, *numTicks, stats)
		deliverReadyResponses(responseQueue, clients, finalTick, stats)
		finalTick++

		// Safety check: prevent infinite loop
		if finalTick > *numTicks+maxQueueDrainTicks {
			log.Fatalf("Failed to drain queues after %d extra ticks", maxQueueDrainTicks)
		}
	}
	log.Println("All queues drained")

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
			// Directly send to server without fault injection
			requestBody, err := json.Marshal(state.SyncRequest)
			if err != nil {
				return fmt.Errorf("client %d round 1 marshal failed: %w", i, err)
			}

			httpReq := httptest.NewRequest(http.MethodPost, "/sync", bytes.NewBuffer(requestBody))
			httpReq.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			server.HandleSync(recorder, httpReq)

			// Skip if server rejected the request
			if recorder.Code != http.StatusOK {
				log.Printf("  Client %d round 1 sync rejected with status %d", i, recorder.Code)
				continue
			}

			// Parse response
			var syncResp sync_engine.SyncResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &syncResp); err != nil {
				return fmt.Errorf("client %d round 1 response parse failed: %w", i, err)
			}

			delivery := SyncDeliveryRequest{
				SyncRequest:  *state.SyncRequest,
				SyncResponse: syncResp,
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
			// Directly send to server without fault injection
			requestBody, err := json.Marshal(state.SyncRequest)
			if err != nil {
				return fmt.Errorf("client %d round 2 marshal failed: %w", i, err)
			}

			httpReq := httptest.NewRequest(http.MethodPost, "/sync", bytes.NewBuffer(requestBody))
			httpReq.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			server.HandleSync(recorder, httpReq)

			// Skip if server rejected the request
			if recorder.Code != http.StatusOK {
				log.Printf("  Client %d round 2 sync rejected with status %d", i, recorder.Code)
				continue
			}

			// Parse response
			var syncResp sync_engine.SyncResponse
			if err := json.Unmarshal(recorder.Body.Bytes(), &syncResp); err != nil {
				return fmt.Errorf("client %d round 2 response parse failed: %w", i, err)
			}

			delivery := SyncDeliveryRequest{
				SyncRequest:  *state.SyncRequest,
				SyncResponse: syncResp,
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
	log.Println("=== Verifying Convergence ===")

	// Collect all final states
	finalStates := make([]*StateResponse, len(clients))
	for i, client := range clients {
		state, err := client.GetAllOps() // Get all operations for verification
		if err != nil {
			return fmt.Errorf("failed to get final state from client %d: %w", i, err)
		}
		finalStates[i] = state
	}

	// Verify clock convergence
	log.Println("Checking property: all clocks converged")
	if err := verifyClocksConverged(finalStates); err != nil {
		return err
	}
	log.Println("✓ All clocks converged")

	// Verify all materialized rows match
	log.Println("Checking property: all materialized rows match")
	if err := verifyRowsMatch(finalStates); err != nil {
		return err
	}
	log.Println("✓ All materialized rows match")

	log.Printf("✓ Convergence verification passed!")

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

func verifyClocksConverged(finalStates []*StateResponse) error {
	if len(finalStates) == 0 {
		return nil
	}

	baseClock := finalStates[0].ClockValue

	for i := 1; i < len(finalStates); i++ {
		if finalStates[i].ClockValue != baseClock {
			return fmt.Errorf("clock convergence failed: client 0 has clock %d, client %d has clock %d",
				baseClock, i, finalStates[i].ClockValue)
		}
	}

	return nil
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

func enqueueSyncRequest(
	requestQueue *RequestQueue,
	client *Client,
	clientIndex int,
	state *StateResponse,
	faultInjector *FaultInjector,
	faultsEnabled bool,
	currentTick int,
	totalTicks int,
	stats *SimulationStats,
) {
	if state.SyncRequest == nil {
		return
	}

	stats.TotalSyncs++
	stats.TotalOperationsSent += len(state.SyncRequest.Operations)

	// Store original request before any corruption
	originalRequest := state.SyncRequest

	// Marshal sync request to JSON
	requestBody, err := json.Marshal(state.SyncRequest)
	if err != nil {
		log.Fatalf("Failed to marshal sync request: %v", err)
	}

	bodyStr := string(requestBody)
	wasCorrupted := false

	// FAULT INJECTION: Corrupt request
	if faultsEnabled && faultInjector.ShouldCorruptRequest() {
		stats.FaultCorruptedRequests++
		faultInjector.CorruptJSON(&bodyStr)
		wasCorrupted = true
	}

	// Calculate delivery time (with optional delay)
	deliverAt := currentTick
	if faultsEnabled && faultInjector.ShouldDelaySync() {
		deliverAt = faultInjector.CalculateDelayTicks(currentTick, totalTicks)
		delayAmount := (deliverAt - currentTick + totalTicks) % totalTicks
		log.Printf("  Client %d: Sync request delayed by %d ticks (deliver at tick %d)",
			clientIndex, delayAmount, deliverAt)
	}

	// Create and enqueue HTTP request
	req := HTTPRequest{
		ClientID:        client.ClientID,
		ClientIndex:     clientIndex,
		EnqueuedAt:      currentTick,
		DeliverAt:       deliverAt,
		Path:            "/sync",
		Body:            bodyStr,
		OriginalRequest: originalRequest,
		WasCorrupted:    wasCorrupted,
	}

	requestQueue.Enqueue(req)

	log.Printf("  Client %d: Enqueued sync request with %d operations (deliver at tick %d)",
		clientIndex, len(state.SyncRequest.Operations), deliverAt)
}

func processHTTPRequest(req HTTPRequest, server *server.Server) HTTPResponse {
	// Create HTTP request
	httpReq := httptest.NewRequest(http.MethodPost, req.Path, bytes.NewBuffer([]byte(req.Body)))
	httpReq.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()

	// Call server handler
	server.HandleSync(recorder, httpReq)

	// Create response
	resp := HTTPResponse{
		ClientID:        req.ClientID,
		ClientIndex:     req.ClientIndex,
		EnqueuedAt:      req.EnqueuedAt,
		StatusCode:      recorder.Code,
		Body:            recorder.Body.String(),
		OriginalRequest: req.OriginalRequest, // Pass through original request
	}

	return resp
}

func processReadyRequests(
	requestQueue *RequestQueue,
	responseQueue *ResponseQueue,
	server *server.Server,
	random *rand.Rand,
	faultInjector *FaultInjector,
	faultsEnabled bool,
	currentTick int,
	totalTicks int,
	stats *SimulationStats,
) {
	readyRequests := requestQueue.TakeReady(currentTick)

	if len(readyRequests) == 0 {
		return
	}

	// Shuffle deterministically using seeded RNG
	random.Shuffle(len(readyRequests), func(i, j int) {
		readyRequests[i], readyRequests[j] = readyRequests[j], readyRequests[i]
	})

	log.Printf("  Processing %d ready requests (shuffled)", len(readyRequests))

	for _, req := range readyRequests {
		latency := currentTick - req.EnqueuedAt
		log.Printf("    Client %d request (latency: %d ticks, corrupted: %v)",
			req.ClientIndex, latency, req.WasCorrupted)

		// Process request → get response
		resp := processHTTPRequest(req, server)
		resp.DeliverAt = currentTick // Default: immediate delivery

		// Check if server rejected the request (e.g., corrupted JSON)
		if resp.StatusCode != http.StatusOK {
			if req.WasCorrupted {
				stats.FaultRejectedRequests++
				log.Printf("    Server rejected corrupted request (expected)")
			} else {
				log.Printf("    Server rejected request with status %d: %s", resp.StatusCode, resp.Body)
			}
			// Still enqueue response so client can handle error if needed
		} else {
			// Parse successful response to count operations
			var syncResp sync_engine.SyncResponse
			if err := json.Unmarshal([]byte(resp.Body), &syncResp); err == nil {
				stats.TotalOperationsRecv += len(syncResp.Operations)
				log.Printf("    Response has %d operations", len(syncResp.Operations))
			}
		}

		// FAULT INJECTION: Corrupt response
		if faultsEnabled && resp.StatusCode == http.StatusOK && faultInjector.ShouldCorruptResponse() {
			resp.WasCorrupted = true
			faultInjector.CorruptJSON(&resp.Body)
			stats.FaultCorruptedResponses++
			log.Printf("    FAULT INJECTION: Response corrupted")
		}

		// FAULT INJECTION: Delay response
		if faultsEnabled && faultInjector.ShouldDelaySync() {
			resp.DeliverAt = faultInjector.CalculateDelayTicks(currentTick, totalTicks)
			stats.FaultDelayedSyncs++
			delayAmount := (resp.DeliverAt - currentTick + totalTicks) % totalTicks
			log.Printf("    FAULT INJECTION: Response delayed by %d ticks (deliver at tick %d)",
				delayAmount, resp.DeliverAt)
		}

		responseQueue.Enqueue(resp)
	}
}

func deliverReadyResponses(
	responseQueue *ResponseQueue,
	clients []*Client,
	currentTick int,
	stats *SimulationStats,
) {
	for i, client := range clients {
		// Get responses in FIFO order (deterministic per client)
		responses := responseQueue.TakeReadyForClient(i, currentTick)

		for _, resp := range responses {
			latency := currentTick - resp.EnqueuedAt
			log.Printf("  Delivering response to Client %d (total latency: %d ticks, corrupted: %v)",
				i, latency, resp.WasCorrupted)

			// Skip if server rejected the request
			if resp.StatusCode != http.StatusOK {
				log.Printf("    Skipping delivery due to non-OK status: %d", resp.StatusCode)
				if resp.WasCorrupted {
					stats.FaultRejectedRequests++
				}
				continue
			}

			// Parse sync response
			var syncResp sync_engine.SyncResponse
			if err := json.Unmarshal([]byte(resp.Body), &syncResp); err != nil {
				log.Printf("    Failed to parse sync response: %v", err)
				if resp.WasCorrupted {
					log.Printf("    Response was corrupted (expected failure)")
					stats.FaultRejectedRequests++
				}
				continue
			}

			// Create sync delivery request using original request and server response
			if resp.OriginalRequest == nil {
				log.Fatalf("INVARIANT VIOLATION: Response for client %d has nil OriginalRequest at tick %d",
					i, currentTick)
			}
			delivery := SyncDeliveryRequest{
				SyncRequest:  *resp.OriginalRequest,
				SyncResponse: syncResp,
			}

			// Deliver to client
			newState, err := client.DeliverSync(delivery)
			if err != nil {
				// If response was corrupted, this is an expected failure
				if resp.WasCorrupted {
					log.Printf("    FAULT INJECTION: Corrupted sync delivery failed (expected): %v", err)
					stats.FaultRejectedRequests++
					continue
				}
				log.Fatalf("Client %s sync delivery failed: %v", client.ClientID, err)
			}

			// Collect operations receive timing
			if newState.OperationsReceiveTimeMs > 0 {
				stats.OperationsReceiveTimes = append(stats.OperationsReceiveTimes, newState.OperationsReceiveTimeMs)
			}

			log.Printf("    After sync - Clock: %d, CRDT operations: %d", newState.ClockValue, len(newState.CRDTOperations))
		}
	}
}
