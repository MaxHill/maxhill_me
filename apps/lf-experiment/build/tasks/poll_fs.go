package tasks

import (
	"context"
	"fmt"
	"log"
	"maps"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// FilePollEntry represents a file being monitored for changes.
// ModifiedTime is stored in nanoseconds since Unix epoch.
// A ModifiedTime of 0 indicates a newly discovered file that should trigger on next poll.
type FilePollEntry struct {
	Path         string
	ModifiedTime int64
	Size         int64
}

// NewFilePollEntry creates a FilePollEntry from a file path and FileInfo.
// The modification time is converted to nanoseconds since Unix epoch.
func NewFilePollEntry(filePath string, info os.FileInfo) FilePollEntry {
	return FilePollEntry{
		Path:         filePath,
		ModifiedTime: info.ModTime().UnixNano(),
		Size:         info.Size(),
	}
}

// DirectoryPoll monitors filesystem paths for changes and triggers callbacks when changes are detected.
// It uses polling to detect file modifications, additions (via FindNewFiles), and deletions.
// Changes are reported through a callback that receives a map of changed files keyed by absolute path.
type DirectoryPoll struct {
	pathsToSearch []string
	filesToWatch  map[string]FilePollEntry
	callback      func(map[string]FilePollEntry)

	// Configurable timing
	pollInterval         time.Duration // How often to run Poll() (default: 300ms)
	findNewFilesInterval int           // Run FindNewFiles every N polls (default: 5)

	// Concurrency control
	mu        sync.Mutex
	isRunning bool
}

// PollerConfig holds optional configuration for DirectoryPoll.
// Use SetPollInterval() and SetFindNewFilesInterval() to customize timing.
type PollerConfig struct {
	PollInterval         time.Duration // How often to run Poll() (default: 300ms)
	FindNewFilesInterval int           // Run FindNewFiles every N polls (default: 5, meaning every 1.5s)
}

// DefaultPollerConfig returns the default polling configuration.
// PollInterval: 300ms, FindNewFilesInterval: every 5 polls (1.5 seconds).
func DefaultPollerConfig() PollerConfig {
	return PollerConfig{
		PollInterval:         300 * time.Millisecond,
		FindNewFilesInterval: 5,
	}
}

// NewFileSystemPoller creates a new DirectoryPoll that monitors the given paths for file changes.
// The callback is invoked with a map of changed files whenever Poll() detects modifications.
// Pass nil for config to use defaults (300ms poll interval, find new files every 5th poll).
// Returns an error if the initial filesystem scan fails.
//
// Usage pattern with Start():
//
//	poller, err := NewFileSystemPoller([]string{"./src"}, nil, func(changes map[string]FilePollEntry) {
//	    fmt.Printf("Detected %d changes\n", len(changes))
//	})
//	ctx, cancel := context.WithCancel(context.Background())
//	defer cancel()
//	go poller.Start(ctx)
//
// Manual usage pattern:
//
//	// Call poller.FindNewFiles() periodically to scan for new files (e.g., every 2 seconds)
//	// Call poller.Poll() frequently to detect modifications (e.g., every 300ms)
func NewFileSystemPoller(pathsToSearch []string, config *PollerConfig, callback func(map[string]FilePollEntry)) (*DirectoryPoll, error) {
	if config == nil {
		defaultCfg := DefaultPollerConfig()
		config = &defaultCfg
	}

	directoryPoll := DirectoryPoll{
		pathsToSearch:        pathsToSearch,
		filesToWatch:         make(map[string]FilePollEntry),
		callback:             callback,
		pollInterval:         config.PollInterval,
		findNewFilesInterval: config.FindNewFilesInterval,
		isRunning:            false,
	}
	err := directoryPoll.buildWatchList()
	if err != nil {
		return &directoryPoll, err
	}

	return &directoryPoll, nil
}

// Poll checks all monitored files for modifications and deletions, invoking the callback if changes are detected.
// This should be called frequently (e.g., every 300ms) to detect file changes with low latency.
// Returns an error if file stat operations fail, though individual file errors don't abort the scan.
//
// Note: Poll() only detects modifications to existing files and deletions.
// Call FindNewFiles() separately to detect newly created files.
func (directoryPoll *DirectoryPoll) Poll() error {
	changes, err := directoryPoll.getChangedFiles()
	if err != nil {
		return err
	}

	if len(changes) > 0 {
		directoryPoll.callback(changes)
	}

	return nil
}

func (directoryPoll *DirectoryPoll) getChangedFiles() (map[string]FilePollEntry, error) {

	changedFiles := map[string]FilePollEntry{}

	var firstError error

	for key, filePollEntry := range directoryPoll.filesToWatch {
		stat, err := os.Stat(filePollEntry.Path)
		if err != nil {
			if os.IsNotExist(err) {
				// File was removed - this is a change!
				changedFiles[key] = filePollEntry
				delete(directoryPoll.filesToWatch, key)
				continue
			}
			// Note: Silently continue on stat errors (e.g., permission denied)
			// to avoid breaking the entire scan for a single file
			if firstError == nil {
				firstError = err
			}
			continue
		}

		if stat.ModTime().UnixNano() > filePollEntry.ModifiedTime {
			filePollEntry.ModifiedTime = stat.ModTime().UnixNano()
			filePollEntry.Size = stat.Size()
			changedFiles[key] = filePollEntry

			directoryPoll.filesToWatch[key] = filePollEntry
		}
	}

	return changedFiles, firstError
}

func (directoryPoll *DirectoryPoll) buildWatchList() error {
	fileNames := make(map[string]FilePollEntry)

	for _, path := range directoryPoll.pathsToSearch {
		newFiles, err := scanDirectoryRecursive(path)
		if err != nil {
			return err
		}
		maps.Copy(fileNames, newFiles)
	}

	directoryPoll.filesToWatch = fileNames
	return nil
}

// FindNewFiles scans monitored directories for newly created files.
// New files are marked with ModifiedTime=0 to trigger detection on the next Poll() call.
// This should be called less frequently than Poll() (e.g., every 2 seconds) as it's more expensive.
// Returns an error if the directory scan fails.
func (directoryPoll *DirectoryPoll) FindNewFiles() error {
	fileNames := directoryPoll.filesToWatch

	for _, path := range directoryPoll.pathsToSearch {
		newFiles, err := scanDirectoryRecursive(path)
		if err != nil {
			return err
		}
		for key, value := range newFiles {
			if _, exists := fileNames[key]; !exists {
				// Set modified time to 0 so it
				// gets picked up as a change on next poll
				value.ModifiedTime = 0
				fileNames[key] = value
			}
		}
	}

	directoryPoll.filesToWatch = fileNames
	return nil
}

// Start begins the automated polling loop that monitors for file changes.
// - Polls at the configured interval (default: every 300ms)
// - Every Nth poll (default: 5th, ~1.5s), also scans for new files
// - Runs in the current goroutine (use `go poller.Start(ctx)` for background execution)
// - Returns when context is cancelled or if a fatal error occurs
// - Logs non-fatal errors and continues polling
//
// Example usage:
//
//	ctx, cancel := context.WithCancel(context.Background())
//	defer cancel()
//	go func() {
//	    if err := poller.Start(ctx); err != nil && err != context.Canceled {
//	        log.Printf("Poller stopped with error: %v", err)
//	    }
//	}()
func (dp *DirectoryPoll) Start(ctx context.Context) error {
	dp.mu.Lock()
	if dp.isRunning {
		dp.mu.Unlock()
		return fmt.Errorf("poller already running")
	}
	dp.isRunning = true
	dp.mu.Unlock()

	defer func() {
		dp.mu.Lock()
		dp.isRunning = false
		dp.mu.Unlock()
	}()

	ticker := time.NewTicker(dp.pollInterval)
	defer ticker.Stop()

	iteration := 0

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			iteration++

			// Every Nth iteration, scan for new files first
			if iteration%dp.findNewFilesInterval == 0 {
				if err := dp.FindNewFiles(); err != nil {
					log.Printf("FindNewFiles error: %v (continuing...)", err)
				}
			}

			// Always poll for changes
			if err := dp.Poll(); err != nil {
				log.Printf("Poll error: %v (continuing...)", err)
			}
		}
	}
}

// IsRunning returns whether the poller is currently running.
// Useful for debugging or preventing duplicate Start() calls.
func (dp *DirectoryPoll) IsRunning() bool {
	dp.mu.Lock()
	defer dp.mu.Unlock()
	return dp.isRunning
}

func scanDirectoryRecursive(dir string) (map[string]FilePollEntry, error) {
	Assert(dir != "", "Path cannot be empty")

	filesFound := make(map[string]FilePollEntry)

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			filesFound[path] = NewFilePollEntry(path, info)
		}
		return nil
	})

	if err != nil {
		return filesFound, err
	}

	return filesFound, nil
}
