package main

import (
	"encoding/json"
	"errors"
	"math/rand"
	"sync/internal/sync_engine"
	"time"
)

type Client struct {
	// Process communication
	processManager *ProcessManager

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
	CRDTOperations []sync_engine.CRDTOperation          `json:"crdtOperations"`
	ClockValue     int64                                `json:"clockValue"`
	SyncRequest    *sync_engine.SyncRequest             `json:"syncRequest,omitempty"`
	Rows           map[string]map[string]map[string]any `json:"rows,omitempty"`
}

type Message struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

func StartClient(file string, clientID string, seed string) (*Client, error) {
	args := []string{"deno", "run", "--allow-all", "--no-check", "--quiet", file, seed}
	processManager, err := Create(args, 30*time.Second)
	if err != nil {
		return nil, err
	}

	return &Client{
		processManager:   processManager,
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

	return &response, nil
}

func (client *Client) DeliverSync(request SyncDeliveryRequest) (*StateResponse, error) {
	var response StateResponse
	if err := client.call("sync_delivery", request, &response); err != nil {
		return nil, err
	}

	return &response, nil
}

func (client *Client) GetAllOps() (*StateResponse, error) {
	var response StateResponse
	if err := client.call("get_all_ops", nil, &response); err != nil {
		return nil, err
	}

	// Don't update client state, just return the response
	return &response, nil
}

func (client *Client) call(messageType string, payload any, response any) error {
	msg := Message{
		Type:    messageType,
		Payload: payload,
	}

	jsonBytes, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	// Use ProcessManager to send request
	responseStr, err := client.processManager.Request(string(jsonBytes))
	if err != nil {
		return err
	}

	// Parse response
	var resp struct {
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}

	if err := json.Unmarshal([]byte(responseStr), &resp); err != nil {
		return err
	}

	if resp.Error != "" {
		return errors.New(resp.Error)
	}

	return json.Unmarshal(resp.Result, response)
}

// Close terminates the client process gracefully
func (client *Client) Close() error {
	if client.processManager == nil {
		return nil
	}
	return client.processManager.Destroy()
}
