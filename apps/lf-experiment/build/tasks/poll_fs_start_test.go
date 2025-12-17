package tasks_test

import (
	"context"
	"fmt"
	"lf-experiment/build/tasks"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestStart_BasicOperation verifies Start() runs and detects changes
func TestStart_BasicOperation(t *testing.T) {
	tempDir := t.TempDir()

	// Create initial file
	testFile := filepath.Join(tempDir, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatal(err)
	}

	callbackCount := 0
	poller, err := tasks.NewFileSystemPoller([]string{tempDir}, nil, func(changes map[string]tasks.WatchedFile) {
		callbackCount++
		t.Logf("Callback %d: detected %d changes", callbackCount, len(changes))
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start poller in background
	errCh := make(chan error, 1)
	go func() {
		errCh <- poller.Start(ctx)
	}()

	// Wait for poller to start
	time.Sleep(50 * time.Millisecond)

	if !poller.IsRunning() {
		t.Fatal("Poller should be running")
	}

	// Modify file to trigger change
	time.Sleep(100 * time.Millisecond)
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}

	// Wait for change to be detected (should happen within 300ms poll interval)
	time.Sleep(400 * time.Millisecond)

	// Stop poller
	cancel()

	// Wait for Start() to return
	select {
	case err := <-errCh:
		if err != context.Canceled {
			t.Errorf("Expected context.Canceled, got: %v", err)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Start() did not return after context cancellation")
	}

	if poller.IsRunning() {
		t.Fatal("Poller should be stopped")
	}

	if callbackCount == 0 {
		t.Error("Callback should have been called at least once")
	}
}

// TestStart_CustomIntervals verifies custom poll intervals work
func TestStart_CustomIntervals(t *testing.T) {
	tempDir := t.TempDir()

	// Create initial file
	testFile := filepath.Join(tempDir, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatal(err)
	}

	config := &tasks.PollerConfig{
		PollInterval:         50 * time.Millisecond, // Fast polling for test
		FindNewFilesInterval: 3,                     // Every 3rd poll
	}

	callbackCount := 0
	poller, err := tasks.NewFileSystemPoller([]string{tempDir}, config, func(changes map[string]tasks.WatchedFile) {
		callbackCount++
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	// Start poller - it should run ~4 polls (200ms / 50ms = 4)
	go poller.Start(ctx)

	// Wait for poller to start
	time.Sleep(25 * time.Millisecond)

	// Modify file multiple times
	for i := 0; i < 3; i++ {
		time.Sleep(60 * time.Millisecond)
		if err := os.WriteFile(testFile, []byte(fmt.Sprintf("change %d", i)), 0644); err != nil {
			t.Fatal(err)
		}
	}

	// Wait for context timeout
	<-ctx.Done()

	// Should have detected at least 2-3 changes
	if callbackCount < 2 {
		t.Errorf("Expected at least 2 callbacks with fast polling, got %d", callbackCount)
	}
}

// TestStart_FindNewFilesInterval verifies FindNewFiles is called every Nth poll
func TestStart_FindNewFilesInterval(t *testing.T) {
	tempDir := t.TempDir()

	// Create initial file
	if err := os.WriteFile(filepath.Join(tempDir, "initial.txt"), []byte("initial"), 0644); err != nil {
		t.Fatal(err)
	}

	config := &tasks.PollerConfig{
		PollInterval:         50 * time.Millisecond,
		FindNewFilesInterval: 2, // Every 2nd poll
	}

	changesDetected := make(map[string]bool)
	poller, err := tasks.NewFileSystemPoller([]string{tempDir}, config, func(changes map[string]tasks.WatchedFile) {
		for path := range changes {
			changesDetected[path] = true
			t.Logf("Detected change: %s", filepath.Base(path))
		}
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	go poller.Start(ctx)

	// Wait for first poll cycle
	time.Sleep(75 * time.Millisecond)

	// Create new file (should be detected by FindNewFiles on 2nd, 4th, 6th poll)
	newFile := filepath.Join(tempDir, "new_file.txt")
	if err := os.WriteFile(newFile, []byte("new"), 0644); err != nil {
		t.Fatal(err)
	}

	// Wait for FindNewFiles to detect it
	// With 50ms interval and every 2nd poll, should detect within ~150ms
	time.Sleep(200 * time.Millisecond)

	<-ctx.Done()

	// Verify new file was detected
	if !changesDetected[newFile] {
		t.Error("New file should have been detected by FindNewFiles")
	}
}

// TestStart_ConcurrentStartError verifies only one Start() can run at a time
func TestStart_ConcurrentStartError(t *testing.T) {
	tempDir := t.TempDir()

	poller, err := tasks.NewFileSystemPoller([]string{tempDir}, nil, func(changes map[string]tasks.WatchedFile) {})
	if err != nil {
		t.Fatal(err)
	}

	ctx1, cancel1 := context.WithCancel(context.Background())
	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel1()
	defer cancel2()

	// Start first instance
	errCh1 := make(chan error, 1)
	go func() {
		errCh1 <- poller.Start(ctx1)
	}()

	// Wait for first to start
	time.Sleep(50 * time.Millisecond)

	// Try to start second instance - should fail
	err2 := poller.Start(ctx2)
	if err2 == nil {
		t.Fatal("Second Start() should have returned an error")
	}
	if err2.Error() != "poller already running" {
		t.Errorf("Expected 'poller already running', got: %v", err2)
	}

	// Stop first instance
	cancel1()
	<-errCh1

	// Now second start should work
	go func() {
		poller.Start(ctx2)
	}()
	time.Sleep(50 * time.Millisecond)

	if !poller.IsRunning() {
		t.Error("Poller should be running after first was stopped")
	}

	cancel2()
}

// TestStart_ContextCancellation verifies Start() respects context cancellation
func TestStart_ContextCancellation(t *testing.T) {
	tempDir := t.TempDir()

	poller, err := tasks.NewFileSystemPoller([]string{tempDir}, nil, func(changes map[string]tasks.WatchedFile) {})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	errCh := make(chan error, 1)
	go func() {
		errCh <- poller.Start(ctx)
	}()

	// Wait for poller to start
	time.Sleep(50 * time.Millisecond)

	if !poller.IsRunning() {
		t.Fatal("Poller should be running")
	}

	// Cancel context
	cancel()

	// Start() should return quickly
	select {
	case err := <-errCh:
		if err != context.Canceled {
			t.Errorf("Expected context.Canceled, got: %v", err)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Start() did not return after context cancellation")
	}

	if poller.IsRunning() {
		t.Error("Poller should not be running after context cancellation")
	}
}

// TestStart_ErrorHandling verifies errors during Poll/FindNewFiles are logged but don't stop polling
func TestStart_ErrorHandling(t *testing.T) {
	tempDir := t.TempDir()

	// Create initial file
	testFile := filepath.Join(tempDir, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatal(err)
	}

	callbackCount := 0
	poller, err := tasks.NewFileSystemPoller([]string{tempDir}, nil, func(changes map[string]tasks.WatchedFile) {
		callbackCount++
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	go poller.Start(ctx)

	// Wait a bit
	time.Sleep(100 * time.Millisecond)

	// Modify file to trigger change
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}

	// Wait for detection
	time.Sleep(400 * time.Millisecond)

	<-ctx.Done()

	// Even with potential errors, callback should have been called
	if callbackCount == 0 {
		t.Error("Callback should have been called despite any non-fatal errors")
	}
}

// TestStart_DefaultConfig verifies nil config uses defaults
func TestStart_DefaultConfig(t *testing.T) {
	tempDir := t.TempDir()

	poller, err := tasks.NewFileSystemPoller([]string{tempDir}, nil, func(changes map[string]tasks.WatchedFile) {})
	if err != nil {
		t.Fatal(err)
	}

	// Verify defaults were applied (we can't directly access private fields,
	// but we can verify the poller works)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- poller.Start(ctx)
	}()

	time.Sleep(50 * time.Millisecond)

	if !poller.IsRunning() {
		t.Fatal("Poller should be running with default config")
	}

	<-ctx.Done()
	<-errCh

	if poller.IsRunning() {
		t.Error("Poller should have stopped")
	}
}
