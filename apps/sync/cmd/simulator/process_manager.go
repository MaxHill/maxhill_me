package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os/exec"
	"time"

	"github.com/google/uuid"
)

type ProcessManager struct {
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	stdout    *bufio.Reader
	ProcessID string
	timeout   time.Duration
}

func Create(args []string, timeout time.Duration) (*ProcessManager, error) {
	// Validate args is not empty
	if len(args) == 0 {
		return nil, errors.New("command args cannot be empty")
	}

	processID := uuid.New().String()
	cmd := exec.Command(args[0], args[1:]...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}
	stdout := bufio.NewReader(stdoutPipe)

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		stdin.Close()
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		stdin.Close()
		return nil, fmt.Errorf("failed to start process: %w", err)
	}

	// Start stderr logging goroutine
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			log.Printf("[LOG:Process(%s)]: %s", processID, scanner.Text())
		}
	}()

	return &ProcessManager{
		cmd:       cmd,
		stdin:     stdin,
		stdout:    stdout,
		ProcessID: processID,
		timeout:   timeout,
	}, nil
}

func (processManager *ProcessManager) Request(jsonStr string) (string, error) {
	if !json.Valid([]byte(jsonStr)) {
		return "", errors.New("invalid input JSON")
	}

	if _, err := processManager.stdin.Write(append([]byte(jsonStr), '\n')); err != nil {
		return "", fmt.Errorf("failed to write to stdin: %w", err)
	}

	type readResult struct {
		line []byte
		err  error
	}
	resultCh := make(chan readResult, 1)
	go func() {
		line, err := processManager.stdout.ReadBytes('\n')
		resultCh <- readResult{line, err}
	}()

	var line []byte
	var err error
	select {
	case result := <-resultCh:
		line = result.line
		err = result.err
	case <-time.After(processManager.timeout):
		return "", fmt.Errorf("timeout (%v) reading response from process", processManager.timeout)
	}

	if err != nil {
		return "", fmt.Errorf("failed to read from stdout: %w", err)
	}

	responseStr := string(line)

	if !json.Valid(line) {
		return "", fmt.Errorf("invalid response JSON: %s", responseStr)
	}

	return responseStr, nil
}

func (processManager *ProcessManager) Destroy() error {
	if processManager.stdin != nil {
		processManager.stdin.Close()
	}

	if processManager.cmd == nil || processManager.cmd.Process == nil {
		return nil
	}

	done := make(chan error, 1)
	go func() {
		done <- processManager.cmd.Wait()
	}()

	select {
	case err := <-done:
		return err
	case <-time.After(5 * time.Second):
		// Force kill if process doesn't exit gracefully
		if err := processManager.cmd.Process.Kill(); err != nil {
			return fmt.Errorf("failed to kill process: %w", err)
		}
		return errors.New("process killed after timeout")
	}
}
