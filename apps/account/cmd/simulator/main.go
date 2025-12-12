package main

import (
	"account/internal"
	"fmt"
	"log"
	"math/rand"
	"time"
)

func main() {
	db, err := internal.NewInMemoryDB()
	if err != nil {
		log.Fatalf("Failed to create simulator database: %v", err)
	}
	defer db.Close()

	// Use deterministic RNG for reproducible simulation runs.
	// Same seed = identical sequence of operations = easier debugging.
	// Change seed to explore different operation patterns.
	// Seed value 42 is arbitrary (conventional placeholder).
	const (
		simulationSeed = 42

		// Initial number of accounts to seed before random operations.
		// Provides base set of IDs for get/update operations.
		initialAccountCount = 10

		// Total random operations to execute during simulation.
		// Chosen to complete in <1 second while providing statistical coverage.
		totalOperations = 1000

		// Maximum balance adjustment range in cents.
		// Range: -1000 to +1000 cents (-$10.00 to +$10.00)
		maxBalanceAdjustmentCents = 1000

		// Maximum tracked account IDs to prevent unbounded slice growth.
		maxTrackedAccounts = 500
	)

	seed := int64(simulationSeed)
	rng := rand.New(rand.NewSource(seed))

	fmt.Printf("Starting simulator with seed: %d\n", seed)
	fmt.Printf("Running %d random operations...\n", totalOperations)

	stats := struct {
		creates   int
		gets      int
		updates   int
		successes int
		failures  int
	}{}

	// Pre-populate database with initial accounts to enable get/update operations
	seedAccountIDs := make([]int64, 0, initialAccountCount)
	for i := 0; i < initialAccountCount; i++ {
		accountID, err := db.CreateAccount(fmt.Sprintf("Account-%d", i), int64(rng.Intn(10000)))
		if err != nil {
			log.Fatalf("Failed to create initial account %d: %v", i, err)
		}
		seedAccountIDs = append(seedAccountIDs, accountID)
	}

	// Verify setup succeeded
	if len(seedAccountIDs) != initialAccountCount {
		log.Fatalf("Expected %d initial accounts, got %d - internal error", initialAccountCount, len(seedAccountIDs))
	}

	accountIDs := seedAccountIDs

	startTime := time.Now()

	// Run random operations
	for i := 0; i < totalOperations; i++ {
		operation := rng.Intn(3)

		switch operation {
		case 0: // CreateAccount
			stats.creates++
			req := internal.CreateAccountRequest{
				Name:    fmt.Sprintf("User-%d", rng.Intn(10000)),
				Balance: int64(rng.Intn(10000)),
			}
			resp := internal.HandleCreateAccount(req, db)
			if resp.Error != "" {
				stats.failures++
			} else {
				stats.successes++
				// Add to tracked IDs with bound to prevent unbounded growth
				if len(accountIDs) < maxTrackedAccounts {
					accountIDs = append(accountIDs, resp.ID)
				} else {
					// Replace random old account ID
					accountIDs[rng.Intn(len(accountIDs))] = resp.ID
				}
			}

		case 1: // GetAccount
			stats.gets++
			if len(accountIDs) == 0 {
				continue
			}
			id := accountIDs[rng.Intn(len(accountIDs))]
			req := internal.GetAccountRequest{ID: id}
			resp := internal.HandleGetAccount(req, db)
			if resp.Error != "" {
				stats.failures++
			} else {
				stats.successes++
			}

		case 2: // UpdateBalance
			stats.updates++
			if len(accountIDs) == 0 {
				continue
			}
			id := accountIDs[rng.Intn(len(accountIDs))]
			req := internal.UpdateBalanceRequest{
				ID:     id,
				Amount: int64(rng.Intn(2*maxBalanceAdjustmentCents) - maxBalanceAdjustmentCents),
			}
			resp := internal.HandleUpdateBalance(req, db)
			if resp.Error != "" {
				stats.failures++
			} else {
				stats.successes++
			}
		}
	}

	elapsed := time.Since(startTime)

	fmt.Println("\n=== Simulation Results ===")
	fmt.Printf("Total operations: %d\n", totalOperations)
	fmt.Printf("  Creates:  %d\n", stats.creates)
	fmt.Printf("  Gets:     %d\n", stats.gets)
	fmt.Printf("  Updates:  %d\n", stats.updates)
	fmt.Printf("Successes: %d\n", stats.successes)
	fmt.Printf("Failures:  %d\n", stats.failures)
	fmt.Printf("Time elapsed: %v\n", elapsed)
	fmt.Printf("Ops/sec: %.2f\n", float64(totalOperations)/elapsed.Seconds())
}
