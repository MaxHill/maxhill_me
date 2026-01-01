package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
)

type Request struct {
	Payload any `json:"payload"`
}

type Response struct {
	Result any    `json:"result"`
	Error  string `json:"error,omitempty"`
}

type Client struct {
	stdin  io.WriteCloser
	stdout *bufio.Reader
}

func StartClient(file string, seed string) (*Client, error) {
	cmd := exec.Command("deno", "run", "--allow-all", "--no-check", "--quiet", file, seed)

	stdin, err := cmd.StdinPipe()
	stdout, err := cmd.StdoutPipe()
	cmd.Stderr = os.Stderr

	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	return &Client{
		stdin:  stdin,
		stdout: bufio.NewReader(stdout),
	}, nil
}

func (client *Client) Call(in any, out any) error {
	req := Request{Payload: in}

	b, err := json.Marshal(req)
	if err != nil {
		return err
	}

	if _, err := client.stdin.Write(append(b, '\n')); err != nil {
		return err
	}

	line, err := client.stdout.ReadBytes('\n')
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

	return json.Unmarshal(resp.Result, out)
}
