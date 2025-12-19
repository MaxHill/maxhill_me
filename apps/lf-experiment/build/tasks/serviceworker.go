package tasks

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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

	hash, err := buildCache(options.workDir, filesToCache)
	if err != nil {
		return buildResult
	}
	// Inject assets into service worker
	if err := injectAssetsIntoServiceWorker(options.workDir, filesToCache, hash); err != nil {
		buildResult.Errors = append(buildResult.Errors, fmt.Sprintf("failed to inject assets: %v", err))
		return buildResult
	}

	log.Printf("  ✓ Cache version: %s", hash)
	log.Printf("  ✓ Populated service worker with %d assets", len(filesToCache))
	return buildResult
}

func buildCache(absWorkDir string, files []string) (string, error) {
	sort.Strings(files)
	combined := sha256.New()
	dir := filepath.Join(absWorkDir, distDir)

	for _, file := range files {
		filePath := filepath.Join(absWorkDir, distDir, file)
		fileHash, err := hashFile(filePath)
		if err != nil {
			log.Printf("Error hashing %s: %v", file, err)
			return "", err
		}

		// Include the filename + hash to avoid collisions.
		// Format: "filename\nhexhash\n"
		rel, _ := filepath.Rel(dir, filePath)
		combined.Write([]byte(rel))
		combined.Write([]byte("\n"))
		combined.Write([]byte(fileHash))
		combined.Write([]byte("\n"))
	}

	finalHash := fmt.Sprintf("%x", combined.Sum(nil))
	return finalHash[:12], nil
}

func injectAssetsIntoServiceWorker(absWorkDir string, files []string, hash string) error {
	swPath := filepath.Join(absWorkDir, distDir, "serviceworker.js")

	content, err := os.ReadFile(swPath)
	if err != nil {
		return fmt.Errorf("failed to read serviceworker.js: %w", err)
	}

	assetsJSON, err := json.Marshal(files)
	if err != nil {
		return fmt.Errorf("failed to marshal assets: %w", err)
	}

	cacheNamePattern := regexp.MustCompile(`"cache_name_placeholder"`)
	cacheNameReplacement := fmt.Sprintf("\"%s\"", hash)
	newContent := cacheNamePattern.ReplaceAllString(string(content), cacheNameReplacement)

	cacheAssetsPattern := regexp.MustCompile(`\["assets_to_cache_placeholder"\]`)
	cacheAssetsReplacement := string(assetsJSON)
	newContent = cacheAssetsPattern.ReplaceAllString(string(newContent), cacheAssetsReplacement)

	// Write back to file
	if err := os.WriteFile(swPath, []byte(newContent), 0644); err != nil {
		return fmt.Errorf("failed to write serviceworker.js: %w", err)
	}

	return nil
}

func NewServiceWorkerBuildStep(workDir string, isDev bool) (BuildTask, error) {
	return BuildServiceWorkerOptions{workDir: workDir}, nil
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}
