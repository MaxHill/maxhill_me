package tasks

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

type BuildFontsOptions struct {
	workDir string
}

func (options BuildFontsOptions) Build() BuildResult {
	buildResult := BuildResult{
		Errors:   make([]string, 0),
		Warnings: make([]string, 0),
	}

	// Source: apps/site/public/fonts/optimized
	// Target: dist/fonts/optimized
	srcDir := filepath.Join(options.workDir, "../site/public/fonts/optimized")
	destDir := filepath.Join(options.workDir, "dist/fonts/optimized")

	// Create destination directory
	if err := os.MkdirAll(destDir, 0755); err != nil {
		buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("failed to create fonts directory: %v", err))
		return buildResult
	}

	// Read source directory
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("failed to read fonts directory: %v", err))
		return buildResult
	}

	// Copy each font file
	copiedCount := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		srcPath := filepath.Join(srcDir, entry.Name())
		destPath := filepath.Join(destDir, entry.Name())

		if err := CopyFile(srcPath, destPath); err != nil {
			buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("failed to copy %s: %v", entry.Name(), err))
			return buildResult
		}
		copiedCount++
	}

	log.Printf("  ✓ Copied %d font files", copiedCount)
	return buildResult
}

func (options BuildFontsOptions) Watch() BuildResult {
	return BuildResult{}
}

func NewFontsBuildStep(workDir string, isDev bool) (BuildTask, error) {
	return BuildFontsOptions{workDir: workDir}, nil
}
