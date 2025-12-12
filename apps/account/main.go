package main

import (
	"account/internal"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync/atomic"
	"time"
)

var core *internal.Core
var requestID int64

func init() {
	core = &internal.Core{}
	*core = internal.NewCore()

	// Start background loop - simple polling
	go func() {
		for {
			core.Tick()
		}
	}()
}

func handler(w http.ResponseWriter, r *http.Request) {
	// Read body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	// Create response channel
	respCh := make(chan *internal.Response, 1)

	// Capture request data
	method := r.Method
	path := r.URL.Path
	bodyStr := string(body)

	// Create handler
	handlerFunc := func(state *internal.RequestState) internal.RequestState {
		responseBody := fmt.Sprintf("Processed: %s %s\nBody: %s\n", method, path, bodyStr)
		state.Done(internal.Response{
			Status: 200,
			Body:   responseBody,
		})
		return *state
	}

	// Check capacity before accepting request
	queueSize := core.RequestQueueSize()
	queueCap := core.RequestQueueCapacity()
	if queueSize > int(float64(queueCap)*0.95) {
		http.Error(w, "Server overloaded", http.StatusServiceUnavailable)
		return
	}

	// Enqueue
	id := atomic.AddInt64(&requestID, 1)
	event := internal.NewRequestEvent{
		RequestID:  id,
		Handler:    handlerFunc,
		ResponseCh: respCh,
	}

	if !core.Enqueue(event) {
		http.Error(w, "Queue full", http.StatusServiceUnavailable)
		return
	}

	// Wait for response with timeout
	select {
	case resp := <-respCh:
		w.WriteHeader(resp.Status)
		w.Write([]byte(resp.Body))
	case <-time.After(5 * time.Second):
		http.Error(w, "Request timeout", http.StatusGatewayTimeout)
	}
}

func directHandler(w http.ResponseWriter, r *http.Request) {
	// Read body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	// Process directly without Core
	responseBody := fmt.Sprintf("Processed: %s %s\nBody: %s\n", r.Method, r.URL.Path, string(body))

	w.WriteHeader(200)
	w.Write([]byte(responseBody))
}

func main() {
	http.HandleFunc("/", handler)
	http.HandleFunc("/direct", directHandler)

	log.Println("Core-based HTTP server running on :8080")
	log.Println("Endpoints:")
	log.Println("  /        - Requests routed through Core")
	log.Println("  /direct  - Direct handler (no Core)")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
