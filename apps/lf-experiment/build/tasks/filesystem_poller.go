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

// WatchedFile represents a file being monitored for changes.
// ModifiedTime is stored in nanoseconds since Unix epoch.
// A ModifiedTime of 0 indicates a newly discovered file that should trigger on next poll.
type WatchedFile struct {
	Path         string
	ModifiedTime int64
	Size         int64
}

// newWatchedFile creates a WatchedFile from a file path and FileInfo.
// The modification time is converted to nanoseconds since Unix epoch.
func newWatchedFile(filePath string, info os.FileInfo) WatchedFile {
	return WatchedFile{
		Path:         filePath,
		ModifiedTime: info.ModTime().UnixNano(),
		Size:         info.Size(),
	}
}

// FileSystemPoller monitors filesystem paths for changes and triggers callbacks when changes are detected.
// It uses polling to detect file modifications, additions (via FindNewFiles), and deletions.
// Changes are reported through a callback that receives a map of changed files keyed by absolute path.
type FileSystemPoller struct {
	pathsToSearch []string
	filesToWatch  map[string]WatchedFile
	callback      func(map[string]WatchedFile)

	// Configurable timing
	pollInterval         time.Duration // How often to run Poll() (default: 300ms)
	findNewFilesInterval int           // Run FindNewFiles every N polls (default: 5)

	// Concurrency control
	mu        sync.Mutex
	isRunning bool
}

// PollerConfig holds optional configuration for FileSystemPoller.
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
//	poller, err := NewFileSystemPoller([]string{"./src"}, nil, func(changes map[string]WatchedFile) {
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
func NewFileSystemPoller(pathsToSearch []string, config *PollerConfig, callback func(map[string]WatchedFile)) (*FileSystemPoller, error) {
	// Validate callback
	if callback == nil {
		return nil, fmt.Errorf("callback cannot be nil")
	}

	// Validate paths
	if len(pathsToSearch) == 0 {
		return nil, fmt.Errorf("pathsToSearch cannot be empty")
	}
	for i, path := range pathsToSearch {
		if path == "" {
			return nil, fmt.Errorf("pathsToSearch[%d] is empty", i)
		}
		// Verify path exists
		if _, err := os.Stat(path); err != nil {
			return nil, fmt.Errorf("pathsToSearch[%d] (%s): %w", i, path, err)
		}
	}

	// Apply default config if nil
	if config == nil {
		defaultCfg := DefaultPollerConfig()
		config = &defaultCfg
	}

	// Validate config
	if config.PollInterval <= 0 {
		return nil, fmt.Errorf("pollInterval must be positive, got %v", config.PollInterval)
	}
	if config.FindNewFilesInterval <= 0 {
		return nil, fmt.Errorf("findNewFilesInterval must be positive, got %d", config.FindNewFilesInterval)
	}

	fsp := FileSystemPoller{
		pathsToSearch:        pathsToSearch,
		filesToWatch:         make(map[string]WatchedFile),
		callback:             callback,
		pollInterval:         config.PollInterval,
		findNewFilesInterval: config.FindNewFilesInterval,
		isRunning:            false,
	}

	err := fsp.buildWatchList()
	if err != nil {
		return nil, fmt.Errorf("initial filesystem scan: %w", err)
	}

	return &fsp, nil
}

// Poll checks all monitored files for modifications and deletions, invoking the callback if changes are detected.
// This should be called frequently (e.g., every 300ms) to detect file changes with low latency.
// Returns an error if file stat operations fail, though individual file errors don't abort the scan.
//
// Note: Poll() only detects modifications to existing files and deletions.
// Call FindNewFiles() separately to detect newly created files.
func (fsp *FileSystemPoller) Poll() error {
	changes, err := fsp.getChangedFiles()
	if err != nil {
		return err
	}

	if len(changes) > 0 {
		fsp.callback(changes)
	}

	return nil
}

func (fsp *FileSystemPoller) getChangedFiles() (map[string]WatchedFile, error) {

	changedFiles := map[string]WatchedFile{}

	var firstError error

	for filePath, currentState := range fsp.filesToWatch {
		stat, err := os.Stat(currentState.Path)
		if err != nil {
			if os.IsNotExist(err) {
				// File was removed - this is a change!
				changedFiles[filePath] = currentState
				delete(fsp.filesToWatch, filePath)
				continue
			}
			// Note: Silently continue on stat errors (e.g., permission denied)
			// to avoid breaking the entire scan for a single file
			if firstError == nil {
				firstError = err
			}
			continue
		}

		if stat.ModTime().UnixNano() > currentState.ModifiedTime {
			currentState.ModifiedTime = stat.ModTime().UnixNano()
			currentState.Size = stat.Size()
			changedFiles[filePath] = currentState

			fsp.filesToWatch[filePath] = currentState
		}
	}

	return changedFiles, firstError
}

func (fsp *FileSystemPoller) buildWatchList() error {
	fileNames := make(map[string]WatchedFile)

	for _, path := range fsp.pathsToSearch {
		newFiles, err := scanDirectoryRecursive(path)
		if err != nil {
			return err
		}
		maps.Copy(fileNames, newFiles)
	}

	fsp.filesToWatch = fileNames
	return nil
}

// FindNewFiles scans monitored directories for newly created files.
// New files are marked with ModifiedTime=0 to trigger detection on the next Poll() call.
// This should be called less frequently than Poll() (e.g., every 2 seconds) as it's more expensive.
// Returns an error if the directory scan fails.
func (fsp *FileSystemPoller) FindNewFiles() error {
	for _, path := range fsp.pathsToSearch {
		newFiles, err := scanDirectoryRecursive(path)
		if err != nil {
			return err
		}
		for filePath, fileInfo := range newFiles {
			if _, exists := fsp.filesToWatch[filePath]; !exists {
				// Set modified time to 0 so it
				// gets picked up as a change on next poll
				fileInfo.ModifiedTime = 0
				fsp.filesToWatch[filePath] = fileInfo
			}
		}
	}

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
func (fsp *FileSystemPoller) Start(ctx context.Context) error {
	fsp.mu.Lock()
	if fsp.isRunning {
		fsp.mu.Unlock()
		return fmt.Errorf("poller already running")
	}
	fsp.isRunning = true
	fsp.mu.Unlock()

	defer func() {
		fsp.mu.Lock()
		fsp.isRunning = false
		fsp.mu.Unlock()
	}()

	ticker := time.NewTicker(fsp.pollInterval)
	defer ticker.Stop()

	iteration := 0

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			iteration++

			// Every Nth iteration, scan for new files first
			if iteration%fsp.findNewFilesInterval == 0 {
				if err := fsp.FindNewFiles(); err != nil {
					log.Printf("FindNewFiles error: %v (continuing...)", err)
				}
			}

			// Always poll for changes
			if err := fsp.Poll(); err != nil {
				log.Printf("Poll error: %v (continuing...)", err)
			}
		}
	}
}

// IsRunning returns whether the poller is currently running.
// Useful for debugging or preventing duplicate Start() calls.
func (fsp *FileSystemPoller) IsRunning() bool {
	fsp.mu.Lock()
	defer fsp.mu.Unlock()
	return fsp.isRunning
}

func scanDirectoryRecursive(dir string) (map[string]WatchedFile, error) {
	Assert(dir != "", "Path cannot be empty")

	filesFound := make(map[string]WatchedFile)

	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err != nil {
				return err
			}
			filesFound[path] = newWatchedFile(path, info)
		}
		return nil
	})

	if err != nil {
		return filesFound, err
	}

	return filesFound, nil
}
