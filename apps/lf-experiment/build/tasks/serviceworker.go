package tasks

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	distDir                  = "dist"
	fileCacheInitialCapacity = 100
)

type BuildServiceWorkerOptions struct {
	workDir string
}

func (options BuildServiceWorkerOptions) Build() BuildResult {
	buildResult := BuildResult{
		Errors:   make([]string, 0),
		Warnings: make([]string, 0),
	}

	filesToCache := make([]string, 0, fileCacheInitialCapacity)
	distPath := filepath.Join(options.workDir, distDir)

	err := filepath.Walk(distPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories
		if info.IsDir() {
			return nil
		}

		// Get path relative to dist directory
		relPath, err := filepath.Rel(distPath, path)
		if err != nil {
			return err
		}

		// Convert to web path (with forward slashes, starting with /)
		webPath := "/" + filepath.ToSlash(relPath)

		// Exclude source maps and the serviceworker itself
		if !strings.HasSuffix(webPath, ".map") &&
			webPath != "/serviceworker.js" {
			filesToCache = append(filesToCache, webPath)
		}
		return nil
	})

	if err != nil {
		buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("failed to walk dist directory: %v", err))
		return buildResult
	}

	// Inject assets into service worker
	if err := injectAssetsIntoServiceWorker(options.workDir, filesToCache); err != nil {
		buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("failed to inject assets: %v", err))
		return buildResult
	}

	log.Printf("  ✓ Populated service worker with %d assets", len(filesToCache))
	return buildResult
}

func injectAssetsIntoServiceWorker(absWorkDir string, assets []string) error {
	swPath := filepath.Join(absWorkDir, distDir, "serviceworker.js")

	content, err := os.ReadFile(swPath)
	if err != nil {
		return fmt.Errorf("failed to read serviceworker.js: %w", err)
	}

	assetsJSON, err := json.Marshal(assets)
	if err != nil {
		return fmt.Errorf("failed to marshal assets: %w", err)
	}

	// Replace the ASSETS_TO_CACHE array by finding the placeholder
	// This works for both minified and non-minified versions
	pattern := regexp.MustCompile(`\["replaced_by_build_script"\]`)
	replacement := string(assetsJSON)
	newContent := pattern.ReplaceAllString(string(content), replacement)

	// Write back to file
	if err := os.WriteFile(swPath, []byte(newContent), 0644); err != nil {
		return fmt.Errorf("failed to write serviceworker.js: %w", err)
	}

	return nil
}

func NewServiceWorkerBuildStep(workDir string, isDev bool) (BuildTask, error) {
	return BuildServiceWorkerOptions{workDir: workDir}, nil
}
