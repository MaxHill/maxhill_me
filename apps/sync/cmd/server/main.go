package main

import (
	"log"
	"net/http"
	"sync/internal/database"
	"sync/internal/sync_engine"
	"time"
)

const (
	maxConcurrentConnections = 100
	serverPort               = ":3001"
)

func main() {
	log.Printf("Restarting...")
	// Init database
	db := database.New(database.DBConfig{
		DBUrl:           ":memory:",
		BusyTimeout:     5000,
		MaxOpenConns:    20,
		MaxIdleConns:    20,
		ConnMaxLifetime: time.Duration(0), // Zero meand never timeout
	})
	syncHandler := sync_engine.NewSyncService(db)

	// Start server
	server := NewServer(*db.Queries(), syncHandler)
	log.Printf("Server listening on http://localhost%s\n", serverPort)
	if err := http.ListenAndServe(serverPort, server); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
