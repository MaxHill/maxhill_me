package main

type AppRequest struct {
	path string
	body string
}
type AppResponse struct {
	body string
}

type RequestQueue struct{}
type ResponseQueue struct{}

func (requestQueue *RequestQueue) Enqueue(clientId Client, iteration int, request AppRequest) {
	// Append a request to the queue
}

func (requestQueue *RequestQueue) Take(clientId Client, iteration int) []AppRequest {
	// Return all requests that matches clientId and has iteration up to iteration
}

func (responseQueue *ResponseQueue) Enqueue(clientId Client, iteration int, request AppRequest) {
	// Append a request to the queue
}

func (responseQueue *ResponseQueue) Take(clientId Client, iteration int) []AppRequest {
	// Return all requests that matches clientId and has iteration up to iteration
}
