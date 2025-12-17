package tasks

import (
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"time"
)

type FilePollEntry struct {
	Path         string
	ModifiedTime int64
	Size         int64
}

func NewFilePollEntry(filePath string, info os.FileInfo) FilePollEntry {
	return FilePollEntry{
		Path:         filePath,
		ModifiedTime: info.ModTime().UnixNano(),
		Size:         info.Size(),
	}
}

type DirectoryPoll struct {
	pathsToSearch []string
	filesToWatch  map[string]FilePollEntry
	callback      func(map[string]FilePollEntry)
}

func NewFileSystemPoller(pathsToSearch []string, callback func(map[string]FilePollEntry)) (*DirectoryPoll, error) {
	directoryPoll := DirectoryPoll{
		pathsToSearch: pathsToSearch,
		filesToWatch:  make(map[string]FilePollEntry, 0),
		callback:      callback,
	}
	err := directoryPoll.buildWatchList()
	if err != nil {
		return &directoryPoll, err
	}

	return &directoryPoll, nil
}

func (directoryPoll *DirectoryPoll) Poll() error {
	changes, err := directoryPoll.getChangedFiles()
	if err != nil {
		fmt.Printf("Error: %+v", err)
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
			fmt.Printf("Warning: failed to stat %s: %v", filePollEntry.Path, err)
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
				// get's picked up as a change on next poll
				value.ModifiedTime = 0
				fileNames[key] = value
			}
		}
	}

	directoryPoll.filesToWatch = fileNames
	return nil
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

// ------------------------------------------------------------------------
// OLD implementation
// ------------------------------------------------------------------------
func Poll(paths []string, callback func()) {
	Assert(len(paths) < 100, "Too many paths to watch. Got %d, Max 100", len(paths))
	// Initialize last modification times for all paths
	lastModTimes := make(map[string]time.Time)
	for _, path := range paths {
		lastModTimes[path] = getLatestModTime(path)
	}
	Assert(len(lastModTimes) == len(paths), "LastModTimes length (%d) does not match paths to poll (%d)", len(lastModTimes), len(paths))

	// Poll for changes every 300ms
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		changed := false
		for i, path := range paths {
			Assert(i < 100, "Too files watched. Itteration %d, Max 100", i)
			currentModTime := getLatestModTime(path)
			if currentModTime.After(lastModTimes[path]) {
				lastModTimes[path] = currentModTime
				changed = true
			}
		}
		if changed {
			callback()
		}
	}
}
