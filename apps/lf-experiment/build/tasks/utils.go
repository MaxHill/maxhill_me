package tasks

import (
	"io"
	"log"
	"os"
	"path/filepath"
)

type BuildResult struct {
	Errors   []string
	Warnings []string
}

type BuildTask interface {
	Build() BuildResult
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
