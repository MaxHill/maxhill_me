package tasks

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

type BuildResult struct {
	Errors   []string
	Warnings []string
}

type BuildTask interface {
	Build() BuildResult
	Watch() BuildResult
}

func PollPaths(paths []string, callback func()) {
	// Initialize last modification times for all paths
	lastModTimes := make(map[string]time.Time)
	for _, path := range paths {
		lastModTimes[path] = getLatestModTime(path)
	}

	fmt.Println("Watching paths:", paths)

	// Poll for changes every 300ms
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		changed := false
		for _, path := range paths {
			currentModTime := getLatestModTime(path)
			if currentModTime.After(lastModTimes[path]) {
				fmt.Printf("%s changed, triggering rebuild...\n", path)
				lastModTimes[path] = currentModTime
				changed = true
			}
		}
		if changed {
			callback()
		}
	}
}

func getLatestModTime(dir string) time.Time {
	var latest time.Time

	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && info.ModTime().After(latest) {
			latest = info.ModTime()
		}
		return nil
	})

	return latest
}

// formatBytes converts bytes to human-readable format
func FormatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

func CopyFile(src, dest string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}
