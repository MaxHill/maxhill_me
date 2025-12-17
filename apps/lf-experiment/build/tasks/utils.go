package tasks

import (
	"fmt"
	"io"
	"log"
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
}

func getLatestModTime(dir string) time.Time {
	Assert(dir != "", "Path cannot be empty")

	var latest time.Time

	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && info.ModTime().After(latest) {
			latest = info.ModTime()
		}
		return nil
	})

	Assert(latest.Before(time.Now()), "LastModTime must be in the past: %s", dir)
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

func Assert(condition bool, format string, args ...interface{}) {
	if !condition {
		log.Fatalf(format, args...)
	}
}

func ClearDist(absWorkDir string, distDir string) {
	distPath := filepath.Join(absWorkDir, distDir)
	if err := os.RemoveAll(distPath); err != nil {
		log.Printf("Warning: failed to remove dist directory: %v", err)
	}
}
