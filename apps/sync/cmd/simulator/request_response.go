package main

import "sync/internal/sync_engine"

// HTTPRequest represents an HTTP request from client to server
type HTTPRequest struct {
	ClientID        string
	ClientIndex     int                      // For quick client lookup
	EnqueuedAt      int                      // Tick when created
	DeliverAt       int                      // Tick when ready to process
	Path            string                   // "/sync"
	Body            string                   // JSON SyncRequest
	OriginalRequest *sync_engine.SyncRequest // Original request before corruption
	WasCorrupted    bool                     // Fault injection tracking
}

// HTTPResponse represents server response back to client
type HTTPResponse struct {
	ClientID        string
	ClientIndex     int
	EnqueuedAt      int
	DeliverAt       int
	StatusCode      int                      // 200 = success, 400 = bad request, etc.
	Body            string                   // JSON SyncResponse or error
	OriginalRequest *sync_engine.SyncRequest // Original request (needed for delivery)
	WasCorrupted    bool
}

// RequestQueue manages pending HTTP requests
type RequestQueue struct {
	requests []HTTPRequest
}

// ResponseQueue manages pending HTTP responses
type ResponseQueue struct {
	responses []HTTPResponse
}

// Enqueue adds a new request to the queue
func (q *RequestQueue) Enqueue(req HTTPRequest) {
	q.requests = append(q.requests, req)
}

// TakeReady returns all requests ready to be processed this tick
// Removes them from the queue
func (q *RequestQueue) TakeReady(currentTick int) []HTTPRequest {
	ready := make([]HTTPRequest, 0, len(q.requests)/2)
	remaining := make([]HTTPRequest, 0, len(q.requests)/2)

	for _, req := range q.requests {
		if req.DeliverAt <= currentTick {
			ready = append(ready, req)
		} else {
			remaining = append(remaining, req)
		}
	}

	q.requests = remaining
	return ready
}

// Len returns number of pending requests
func (q *RequestQueue) Len() int {
	return len(q.requests)
}

// Enqueue adds a response to the queue
func (q *ResponseQueue) Enqueue(resp HTTPResponse) {
	q.responses = append(q.responses, resp)
}

// TakeReadyForClient returns all responses ready for a specific client this tick
// Returns them in FIFO order, removes from queue
func (q *ResponseQueue) TakeReadyForClient(clientIndex int, currentTick int) []HTTPResponse {
	ready := make([]HTTPResponse, 0, len(q.responses)/2)
	remaining := make([]HTTPResponse, 0, len(q.responses)/2)

	for _, resp := range q.responses {
		if resp.ClientIndex == clientIndex && resp.DeliverAt <= currentTick {
			ready = append(ready, resp)
		} else {
			remaining = append(remaining, resp)
		}
	}

	q.responses = remaining
	return ready
}

// Len returns number of pending responses
func (q *ResponseQueue) Len() int {
	return len(q.responses)
}
