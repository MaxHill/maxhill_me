package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"sync/internal/auth"
	"sync/internal/repository"
	"sync/internal/server"
	"sync/internal/sync_engine"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const (
	maxConcurrentConnections = 100
	serverPort               = ":3001"
)

func main() {
	log.Printf("Starting sync server...")

	// Open database connection
	// Using file-based SQLite for persistence across restarts
	// To reset the database, delete ./sync.db
	db, err := sql.Open("sqlite3", "./sync.db?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Configure connection pool
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(20)
	db.SetConnMaxLifetime(time.Duration(0)) // Zero means never timeout

	// Initialize schema
	ctx := context.Background()
	if err := repository.InitSchema(ctx, db); err != nil {
		log.Fatalf("Error initializing database schema: %v", err)
	}

	// Create sync service
	syncService := sync_engine.NewSyncService(db)

	// Setup auth middleware
	issuerURL := os.Getenv("AUTH_ISSUER_URL")
	var handler http.Handler
	mux := server.NewServer(syncService, maxConcurrentConnections)

	if issuerURL == "" {
		log.Fatalf("AUTH_ISSUER_URL environment variable is required")
	}
	authMiddleware, err := auth.NewMiddleware(ctx, issuerURL)
	if err != nil {
		log.Fatalf("Failed to initialize auth middleware: %v", err)
	}
	handler = server.Cors(authMiddleware.Wrap(mux))
	log.Printf("Auth enabled with issuer: %s", issuerURL)

	// Start server
	log.Printf("Server listening on http://localhost%s\n", serverPort)
	if err := http.ListenAndServe(serverPort, handler); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
