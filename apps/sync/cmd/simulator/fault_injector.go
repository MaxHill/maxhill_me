package main

import (
	"log"
	"math/rand"
	"sync/internal/sync_engine"
)

type FaultConfig struct {
	// Delayed sync delivery
	DelayedSyncProbability float64
	DelayedSyncMinTicks    int
	DelayedSyncMaxTicks    int

	// Request corruption
	CorruptRequestProbability float64

	// Response corruption
	CorruptResponseProbability float64
}

type DelayedSync struct {
	Client        *Client
	Delivery      SyncDeliveryRequest
	DeliverAtTick int
	DelayedAtTick int  // for logging
	WasCorrupted  bool // whether request or response was corrupted
}

type FaultInjector struct {
	config FaultConfig
	random *rand.Rand
}

func NewFaultInjector(config FaultConfig, random *rand.Rand) *FaultInjector {
	return &FaultInjector{config: config, random: random}
}

func (f *FaultInjector) ShouldDelaySync() bool {
	return f.random.Float64() < f.config.DelayedSyncProbability
}

func (f *FaultInjector) CalculateDelayTicks(currentTick, totalTicks int) int {
	delay := f.random.Intn(f.config.DelayedSyncMaxTicks-f.config.DelayedSyncMinTicks+1) +
		f.config.DelayedSyncMinTicks

	// Use modulo to wrap around
	deliverAt := (currentTick + delay) % totalTicks
	return deliverAt
}

func (f *FaultInjector) ShouldCorruptRequest() bool {
	return f.random.Float64() < f.config.CorruptRequestProbability
}

func (f *FaultInjector) ShouldCorruptResponse() bool {
	return f.random.Float64() < f.config.CorruptResponseProbability
}

// Severe request corruption
func (f *FaultInjector) CorruptRequest(req *sync_engine.SyncRequest) {
	if len(req.Entries) == 0 {
		// If no entries, can only corrupt metadata fields
		corruptionType := f.random.Intn(2)
		switch corruptionType {
		case 0: // Empty required field (clientID)
			req.ClientID = ""
			log.Printf("    FAULT INJECTION: Cleared request clientID")
		case 1: // Invalid last seen version to very large number
			req.ClientLastSeenVersion = 999999999
			log.Printf("    FAULT INJECTION: Corrupted request lastSeenVersion to 999999999")
		}
		return
	}

	corruptionType := f.random.Intn(5)

	switch corruptionType {
	case 0: // Null/invalid value
		idx := f.random.Intn(len(req.Entries))
		req.Entries[idx].Value = nil
		log.Printf("    FAULT INJECTION: Nullified request entry %d value", idx)

	case 1: // Negative version (invalid)
		idx := f.random.Intn(len(req.Entries))
		req.Entries[idx].Version = -1 * f.random.Int63()
		log.Printf("    FAULT INJECTION: Corrupted request entry %d version to negative", idx)

	case 2: // Empty required field (clientID)
		req.ClientID = ""
		log.Printf("    FAULT INJECTION: Cleared request clientID")

	case 3: // Invalid last seen version to very large number (won't cause duplicates)
		req.ClientLastSeenVersion = 999999999
		log.Printf("    FAULT INJECTION: Corrupted request lastSeenVersion to 999999999")

	case 4: // Remove operation field
		idx := f.random.Intn(len(req.Entries))
		req.Entries[idx].Operation = ""
		log.Printf("    FAULT INJECTION: Cleared request entry %d operation", idx)
	}
}

// Severe response corruption
func (f *FaultInjector) CorruptResponse(resp *sync_engine.SyncResponse) {
	if len(resp.Entries) == 0 {
		return
	}

	corruptionType := f.random.Intn(4)

	switch corruptionType {
	case 0: // Null value
		idx := f.random.Intn(len(resp.Entries))
		resp.Entries[idx].Value = nil
		log.Printf("    FAULT INJECTION: Nullified response entry %d value", idx)

	case 1: // Invalid server version
		idx := f.random.Intn(len(resp.Entries))
		resp.Entries[idx].ServerVersion = 0
		log.Printf("    FAULT INJECTION: Corrupted response entry %d serverVersion to 0", idx)

	case 2: // Duplicate entry
		idx := f.random.Intn(len(resp.Entries))
		resp.Entries = append(resp.Entries, resp.Entries[idx])
		log.Printf("    FAULT INJECTION: Duplicated response entry %d", idx)

	case 3: // Wrong client ID on entry
		idx := f.random.Intn(len(resp.Entries))
		resp.Entries[idx].ClientID = "CORRUPTED-CLIENT-ID"
		log.Printf("    FAULT INJECTION: Corrupted response entry %d clientID", idx)
	}
}
