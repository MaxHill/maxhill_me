package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"math/rand"
	"os"
	"os/exec"
	"sync/internal/sync_engine"
	"time"
)

type Client struct {
	// Process communication
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader

	// Identity
	ClientID string
	Seed     string

	// Random behavior configuration
	ChanceWriteUser  float64
	ChanceDeleteUser float64
	ChanceClearUser  float64
	ChanceWritePost  float64
	ChanceDeletePost float64
	ChanceClearPost  float64
	ChanceSync       float64

	// Current state snapshot (updated after each tick)
	WalEntries []sync_engine.WALEntry
	ClockValue int64
}

type ActionRequest struct {
	WriteUser   bool `json:"writeUser"`
	DeleteUser  bool `json:"deleteUser"`
	ClearUser   bool `json:"clearUser"`
	WritePost   bool `json:"writePost"`
	DeletePost  bool `json:"deletePost"`
	ClearPost   bool `json:"clearPost"`
	RequestSync bool `json:"requestSync"`
}

type SyncDeliveryRequest struct {
	SyncRequest  sync_engine.SyncRequest  `json:"syncRequest"`
	SyncResponse sync_engine.SyncResponse `json:"syncResponse"`
}

type StateResponse struct {
	WalEntries       []sync_engine.WALEntry   `json:"walEntries"`
	ClockValue       int64                    `json:"clockValue"`
	SyncRequest      *sync_engine.SyncRequest `json:"syncRequest,omitempty"`
	ActionTimeMs     float64                  `json:"actionTimeMs,omitempty"`
	WalReceiveTimeMs float64                  `json:"walReceiveTimeMs,omitempty"`
	SyncPrepTimeMs   float64                  `json:"syncPrepTimeMs,omitempty"`
}

type Message struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

func StartClient(file string, clientID string, seed string) (*Client, error) {
	cmd := exec.Command("deno", "run", "--allow-all", "--no-check", "--quiet", file, seed)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		return nil, err
	}

	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	return &Client{
		cmd:              cmd,
		stdin:            stdin,
		stdout:           bufio.NewReader(stdout),
		ClientID:         clientID,
		Seed:             seed,
		ChanceWriteUser:  0.3,
		ChanceDeleteUser: 0.3,
		ChanceClearUser:  0.1,
		ChanceWritePost:  0.3,
		ChanceDeletePost: 0.3,
		ChanceClearPost:  0.1,
		ChanceSync:       0.5,
	}, nil
}

func (client *Client) GenerateRandomActions(random *rand.Rand) ActionRequest {
	return ActionRequest{
		WriteUser:  random.Float64() < client.ChanceWriteUser,
		DeleteUser: random.Float64() < client.ChanceDeleteUser,
		ClearUser:  random.Float64() < client.ChanceClearUser,
		WritePost:  random.Float64() < client.ChanceWritePost,
		DeletePost: random.Float64() < client.ChanceDeletePost,
		ClearPost:  random.Float64() < client.ChanceClearPost,
	}
}

func (client *Client) ShouldSync(random *rand.Rand) bool {
	return random.Float64() < client.ChanceSync
}

func (client *Client) PerformActions(actions ActionRequest, requestSync bool) (*StateResponse, error) {
	actions.RequestSync = requestSync

	var response StateResponse
	if err := client.call("action", actions, &response); err != nil {
		return nil, err
	}

	client.updateState(&response)
	return &response, nil
}

func (client *Client) DeliverSync(request SyncDeliveryRequest) (*StateResponse, error) {
	var response StateResponse
	if err := client.call("sync_delivery", request, &response); err != nil {
		return nil, err
	}

	client.updateState(&response)
	return &response, nil
}

func (client *Client) call(messageType string, payload any, response any) error {
	msg := Message{
		Type:    messageType,
		Payload: payload,
	}

	b, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	if _, err := client.stdin.Write(append(b, '\n')); err != nil {
		return err
	}

	// Read response with timeout
	type readResult struct {
		line []byte
		err  error
	}
	resultCh := make(chan readResult, 1)
	go func() {
		line, err := client.stdout.ReadBytes('\n')
		resultCh <- readResult{line, err}
	}()

	var line []byte
	select {
	case result := <-resultCh:
		line = result.line
		err = result.err
	case <-time.After(30 * time.Second):
		return errors.New("timeout reading response from client process")
	}

	if err != nil {
		return err
	}

	var resp struct {
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}

	if err := json.Unmarshal(line, &resp); err != nil {
		return err
	}

	if resp.Error != "" {
		return errors.New(resp.Error)
	}

	return json.Unmarshal(resp.Result, response)
}

func (client *Client) updateState(response *StateResponse) {
	client.WalEntries = response.WalEntries
	client.ClockValue = response.ClockValue
}

// Close terminates the client process gracefully with a timeout
func (client *Client) Close() error {
	if client.stdin != nil {
		client.stdin.Close() // Signal process to exit
	}

	if client.cmd == nil || client.cmd.Process == nil {
		return nil
	}

	// Wait for process to exit with timeout
	done := make(chan error, 1)
	go func() {
		done <- client.cmd.Wait()
	}()

	select {
	case err := <-done:
		return err
	case <-time.After(5 * time.Second):
		// Force kill if process doesn't exit gracefully
		if err := client.cmd.Process.Kill(); err != nil {
			return err
		}
		return errors.New("client process killed after timeout")
	}
}
