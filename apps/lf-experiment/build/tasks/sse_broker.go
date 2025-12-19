package tasks

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// SSEBroker manages Server-Sent Events connections for live reload in dev mode
type SSEBroker struct {
	clients map[chan string]bool
	mu      sync.Mutex
}

// ReloadEvent represents a reload notification sent to clients
type ReloadEvent struct {
	Timestamp string `json:"timestamp"`
	Reason    string `json:"reason"`
}

// NewSSEBroker creates a new SSE broker instance
func NewSSEBroker() *SSEBroker {
	return &SSEBroker{
		clients: make(map[chan string]bool),
	}
}

// AddClient registers a new SSE client connection
func (b *SSEBroker) AddClient(clientChan chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.clients[clientChan] = true
	log.Printf("SSE client connected (total: %d)", len(b.clients))
}

// RemoveClient unregisters an SSE client connection
func (b *SSEBroker) RemoveClient(clientChan chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, clientChan)
	close(clientChan)
	log.Printf("SSE client disconnected (total: %d)", len(b.clients))
}

// Broadcast sends a reload event to all connected clients
func (b *SSEBroker) Broadcast(reason string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	event := ReloadEvent{
		Timestamp: time.Now().Format(time.RFC3339),
		Reason:    reason,
	}

	data, _ := json.Marshal(event)
	message := fmt.Sprintf("event: reload\ndata: %s\n\n", string(data))

	for clientChan := range b.clients {
		select {
		case clientChan <- message:
			// Message sent successfully
		default:
			// Client not ready, skip (don't block)
		}
	}
}

// ServeHTTP implements http.Handler for the SSE endpoint
func (b *SSEBroker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Create channel for this client
	clientChan := make(chan string, 10)
	b.AddClient(clientChan)
	defer b.RemoveClient(clientChan)

	// Send initial connected message
	fmt.Fprintf(w, "event: connected\ndata: {\"status\": \"ready\"}\n\n")
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// Stream events to client
	for {
		select {
		case msg := <-clientChan:
			fmt.Fprint(w, msg)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		case <-r.Context().Done():
			// Client disconnected
			return
		}
	}
}
