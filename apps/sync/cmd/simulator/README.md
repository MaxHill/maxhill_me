```go

type Client struct {
    // For process communication
	stdin  io.WriteCloser
	stdout *bufio.Reader

    // Random behavior
    ChanceWrite int
    ChanceDelete int
    ChanceClear int
    ChanceSync int

    // State
    WalEntries WALEntries[]
    ClockValue int
    ActiveSyncRequest sync_engine.SyncRequest
    ActiveSyncResponse sync_engine.SyncResponse
}

// This type is sent to deno and deno sends a response looking the same
// back
type Message struct {
    type string // Example "tick"
    payload any
}

// This is a particular request, will be sent in Message as type
// "tick_request" and payload will be this struct
type TickRequest struct {
    Sync bool
    Delete bool
    Clear bool
    Sync int
    SyncResponse sync_engine.SyncResponse
}

// This is a particular response, will be received in Message as type
// "tick_response" and payload will be this struct
type TickResponse struct {
    NewSyncRequest sync_engine.SyncRequest
    WalEntries sync_engine.SyncRequest
    ClockValue int
}

// Generate a new client based on seed
func StartClient(file string, seed string) (*Client, error) {

// Generates a new TickRequest sends it to the client
// Parses the response message and marshalls it into a TickResponse
func (client *Client) Tick() (TickResponse, error)

// Generates a tick request based ont the client random parameters
func (client *Client) generateTickRequest(random *rand.Rand) TickRequest

// Send a message to the client and receives a message in return
func (client *Client) call(message Message, response any) error

// Updates the client with the data from the tickResponse
func (client) update(respons TickResponse) error


```
