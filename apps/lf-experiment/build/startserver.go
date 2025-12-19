package main

import (
	"log"
	"net/http"

	"lf-experiment/build/tasks"
)

func startServer(sseBroker *tasks.SSEBroker) {
	log.Printf("Starting server on http://localhost:%s", serverPort)
	log.Printf("Serving files from %s directory", serverDistDir)

	// Create a new ServeMux to avoid conflicts with default handlers
	mux := http.NewServeMux()

	// Register SSE endpoint for live reload (must be before file server)
	mux.Handle("/dev/reload-stream", sseBroker)
	log.Println("Live reload enabled at /dev/reload-stream")

	// Static file serving (catch-all, must be last)
	mux.Handle("/", http.FileServer(http.Dir(serverDistDir)))

	if err := http.ListenAndServe(":"+serverPort, mux); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
